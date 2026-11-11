import {
  type CallExpression,
  Node,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import type { ConfigDraft } from "./project-config";

const LOAD_ENV_FILE = "loadEnvFile";
const DOTENV = /^dotenv(\/|$)/;
const DOTENV_CONFIG = /^dotenv\/config(\.js)?$/;
const DOTENV_CALL = "config";
const ENV_FILE_CONSTANT = "projectEnvFile";
const ESM_CONFIG = /\.mts$/;
const ENV_FILE_NAMES = new Set([".env", "./.env"]);
/** How many constants a path is followed through, so one declared through itself ends. */
const MAX_FOLLOWED = 4;
const PATH_JOINS = new Set(["join", "resolve"]);
const CONFIG_DIRECTORIES = new Set([
  "__dirname",
  "import.meta.dirname",
  "process.cwd()",
]);

interface NamedImport {
  module: string;
  aliases: string[];
  name: string;
  /** The local name used when `name` is taken in the file already. */
  fallback: string;
}

const EXISTS: NamedImport = {
  module: "node:fs",
  aliases: ["node:fs", "fs"],
  name: "existsSync",
  fallback: "envFileExists",
};
const JOIN: NamedImport = {
  module: "node:path",
  aliases: ["node:path", "path"],
  name: "join",
  fallback: "joinEnvPath",
};

function importsUnaliased(file: SourceFile, wanted: NamedImport): boolean {
  return file
    .getImportDeclarations()
    .filter((declaration) =>
      wanted.aliases.includes(declaration.getModuleSpecifierValue()),
    )
    .some((declaration) =>
      declaration
        .getNamedImports()
        .some(
          (specifier) =>
            specifier.getName() === wanted.name && !specifier.getAliasNode(),
        ),
    );
}

function usesName(file: SourceFile, name: string): boolean {
  return file
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some((identifier) => identifier.getText() === name);
}

/** `name`, or the first of `name2`, `name3`… the file does not use yet. */
function freeName(file: SourceFile, name: string): string {
  let candidate = name;
  for (let suffix = 2; usesName(file, candidate); suffix += 1) {
    candidate = `${name}${suffix}`;
  }
  return candidate;
}

function calleeName(call: CallExpression): string {
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee)
    ? callee.getName()
    : callee.getText();
}

/** The value a name of the file is declared with, when it is declared once with one. */
function declaredValue(file: SourceFile, name: string): Node | undefined {
  const declarations = file
    .getVariableDeclarations()
    .filter((declaration) => declaration.getName() === name);
  return declarations.length === 1
    ? declarations[0].getInitializer()
    : undefined;
}

/** Whether a call by that name joins paths: `join` or `resolve`, or either imported from node:path under another name. */
function joinsPath(file: SourceFile, name: string): boolean {
  return (
    PATH_JOINS.has(name) ||
    file
      .getImportDeclarations()
      .filter((declaration) =>
        JOIN.aliases.includes(declaration.getModuleSpecifierValue()),
      )
      .some((declaration) =>
        declaration
          .getNamedImports()
          .some(
            (specifier) =>
              PATH_JOINS.has(specifier.getName()) &&
              specifier.getAliasNode()?.getText() === name,
          ),
      )
  );
}

/** Whether `node` names the `.env` beside the configuration, as written there or through a constant. */
function namesProjectEnv(
  file: SourceFile,
  node: Node | undefined,
  followed = 0,
): boolean {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return ENV_FILE_NAMES.has(node.getLiteralValue());
  }
  if (Node.isIdentifier(node)) {
    return (
      followed < MAX_FOLLOWED &&
      namesProjectEnv(file, declaredValue(file, node.getText()), followed + 1)
    );
  }
  if (!Node.isCallExpression(node) || !joinsPath(file, calleeName(node))) {
    return false;
  }
  const [directory, name, ...rest] = node.getArguments();
  return (
    rest.length === 0 &&
    directory !== undefined &&
    CONFIG_DIRECTORIES.has(directory.getText()) &&
    Node.isStringLiteral(name) &&
    ENV_FILE_NAMES.has(name.getLiteralValue())
  );
}

/** Whether a dotenv `config(…)` call loads the `.env` beside the configuration: its default, or that path. */
function dotenvLoadsProjectEnv(
  file: SourceFile,
  call: CallExpression,
): boolean {
  const [options] = call.getArguments();
  if (options === undefined) {
    return true;
  }
  if (!Node.isObjectLiteralExpression(options)) {
    return false;
  }
  const pathOption = options.getProperty("path");
  if (pathOption === undefined) {
    return true;
  }
  return (
    Node.isPropertyAssignment(pathOption) &&
    namesProjectEnv(file, pathOption.getInitializer())
  );
}

function requiresDotenv(call: CallExpression, pattern: RegExp): boolean {
  const [argument] = call.getArguments();
  return (
    calleeName(call) === "require" &&
    Node.isStringLiteral(argument) &&
    pattern.test(argument.getLiteralValue())
  );
}

function importsDotenv(file: SourceFile, pattern: RegExp): boolean {
  return (
    file
      .getImportDeclarations()
      .some((declaration) =>
        pattern.test(declaration.getModuleSpecifierValue()),
      ) ||
    file
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => requiresDotenv(call, pattern))
  );
}

/**
 * Whether the configuration loads the `.env` beside it itself: `loadEnvFile` or dotenv given that
 * file, or their default, which is the `.env` of the directory the project runs from. A loader of
 * another file does not count, so the builder's own loading code is added beside it.
 */
export function loadsEnvFile(file: SourceFile): boolean {
  if (importsDotenv(file, DOTENV_CONFIG)) {
    return true;
  }
  const dotenv = importsDotenv(file, DOTENV);
  return file.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const name = calleeName(call);
    if (name === LOAD_ENV_FILE) {
      const [argument] = call.getArguments();
      return argument === undefined || namesProjectEnv(file, argument);
    }
    return dotenv && name === DOTENV_CALL && dotenvLoadsProjectEnv(file, call);
  });
}

interface ImportedName {
  local: string;
  inserted: boolean;
}

/**
 * The local name `wanted` goes by once imported: an import the file has already, or a new
 * declaration of its own at `index`, so an existing namespace or aliased import is left as it is.
 */
function ensureNamedImport(
  file: SourceFile,
  wanted: NamedImport,
  index: number,
): ImportedName {
  if (importsUnaliased(file, wanted)) {
    return { local: wanted.name, inserted: false };
  }
  const local = usesName(file, wanted.name)
    ? freeName(file, wanted.fallback)
    : wanted.name;
  file.insertImportDeclaration(index, {
    moduleSpecifier: wanted.module,
    namedImports: [
      local === wanted.name ? wanted.name : { name: wanted.name, alias: local },
    ],
  });
  return { local, inserted: true };
}

function loadingText(
  draft: ConfigDraft,
  names: { exists: string; join: string; envFile: string },
): string {
  const directory = ESM_CONFIG.test(draft.path)
    ? "import.meta.dirname"
    : "__dirname";
  return [
    `const ${names.envFile} = ${names.join}(${directory}, ".env");`,
    `if (${names.exists}(${names.envFile})) {`,
    `${draft.unit}process.loadEnvFile(${names.envFile});`,
    "}",
  ].join("\n");
}

/**
 * Makes the configuration load the project's `.env`, when it names a variable and does not load
 * one already. Core does not read `.env`, and a variable the builder writes there would otherwise
 * never reach the configuration in development.
 */
export function ensureEnvFileLoaded(draft: ConfigDraft): void {
  if (draft.variables.length === 0 || loadsEnvFile(draft.file)) {
    return;
  }
  const exists = ensureNamedImport(draft.file, EXISTS, 0);
  const join = ensureNamedImport(draft.file, JOIN, exists.inserted ? 1 : 0);
  const imports = draft.file.getImportDeclarations();
  const position = imports[imports.length - 1].getEnd();
  const envFile = freeName(draft.file, ENV_FILE_CONSTANT);
  draft.file.insertText(
    position,
    `\n\n${loadingText(draft, { exists: exists.local, join: join.local, envFile })}`,
  );
}
