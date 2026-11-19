import fs from "node:fs";
import path from "node:path";
import {
  type CallExpression,
  type FunctionDeclaration,
  Node,
  type Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import {
  compiledModulePath,
  manifestPath,
  manifestWithDeclaration,
  readManifest,
} from "./theme-declaration";
import {
  pruneUnusedImports,
  referencedImportNames,
  type Transaction,
} from "./writable";

/**
 * Above the DMS's own frontend, which registers at 0, so the project's values
 * win over the DMS defaults wherever both set one.
 */
const LAYER_PRIORITY = 1;

const START_FUNCTION_NAME = "start";
const PATH_MODULES = ["node:path", "path"];
const PAGE_INTERFACE = "@antelopejs/interface-dms/page";
const REGISTER_FUNCTION_NAME = "AddFrontendModule";
const REGISTRATION_TYPE = "FrontendModuleRegistration";
const FRONTEND_MODULE_FUNCTION = "frontendModule";
const FRONTEND_MODULE_FILE = "frontend-module.ts";
const FRONTEND_MODULE_SPECIFIER = "./frontend-module";

/** What a layer is registered as: its name, and where it is from the directory the project runs from. */
interface LayerRegistration {
  name: string;
  /** From the directory of the built entry, with `/` on every platform. */
  runtimeRelativePath: string;
}

/** The project's declaration of its frontend module, once written. */
export type Declaration =
  | { ok: true; manifest: { path: string; text: string } }
  | { ok: false; detail: string };

function refusal(detail: string): Declaration {
  return { ok: false, detail };
}

/**
 * The frontend module's source: the registration the backend passes to
 * `AddFrontendModule`, as a function of nothing but `node:path`, because
 * the frontend loader loads the compiled file on its own, without the
 * backend.
 */
function frontendModuleSource(
  registrationLiteral: string,
  pathImport: string | undefined,
): string {
  const imports = [
    pathImport,
    `import type { ${REGISTRATION_TYPE} } from "${PAGE_INTERFACE}";`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
  return `${imports}

/**
 * The project's frontend module: the backend passes it to \`${REGISTER_FUNCTION_NAME}\`,
 * and \`package.json\` names its compiled file as \`dmsFrontend\`, which is how
 * \`ajs dms dev\` and \`ajs dms build\` find the layer. It imports nothing at run
 * time but Node.js built-ins, because the frontend loader loads this file on
 * its own.
 */
export function ${FRONTEND_MODULE_FUNCTION}(): ${REGISTRATION_TYPE} {
  return ${registrationLiteral};
}
`;
}

function canonicalLiteral(registration: LayerRegistration): string {
  return `{
name: ${JSON.stringify(registration.name)},
sourcePath: path.join(__dirname, ${JSON.stringify(registration.runtimeRelativePath)}),
renderer: { name: "vue", version: "3" },
priority: ${LAYER_PRIORITY},
}`;
}

function pathImportDeclaration(barrel: SourceFile) {
  return barrel.getImportDeclaration((candidate) =>
    PATH_MODULES.includes(candidate.getModuleSpecifierValue()),
  );
}

/**
 * The barrel's own import of `node:path`, when the registration it moves
 * uses the name it binds.
 */
function pathImportUsedBy(
  barrel: SourceFile,
  literal: string,
): string | undefined {
  const declaration = pathImportDeclaration(barrel);
  const binding =
    declaration?.getDefaultImport()?.getText() ??
    declaration?.getNamespaceImport()?.getText();
  return binding && literal.includes(`${binding}.`)
    ? declaration?.getText()
    : undefined;
}

/** `path` for the file the builder writes, whatever the barrel binds. */
const CANONICAL_PATH_IMPORT = 'import path from "node:path";';

function ensureRegisterFunctionImport(barrel: SourceFile): void {
  const declaration = barrel.getImportDeclaration(
    (candidate) => candidate.getModuleSpecifierValue() === PAGE_INTERFACE,
  );
  const namedImports = declaration?.getNamedImports() ?? [];
  if (
    namedImports.some(
      (specifier) => specifier.getName() === REGISTER_FUNCTION_NAME,
    )
  ) {
    return;
  }
  if (declaration && !declaration.isTypeOnly()) {
    declaration.addNamedImport(REGISTER_FUNCTION_NAME);
    return;
  }
  barrel.addImportDeclaration({
    moduleSpecifier: PAGE_INTERFACE,
    namedImports: [REGISTER_FUNCTION_NAME],
  });
}

/**
 * Makes the exported `start()` async so it can await the registration (a
 * `void` return type becomes `Promise<void>`), or adds one at the end of the
 * file. Undefined when `start` names something else, or a function that is
 * not exported or has no body.
 */
function ensureAsyncStartFunction(
  barrel: SourceFile,
): FunctionDeclaration | undefined {
  const existing = barrel.getFunction(START_FUNCTION_NAME);
  if (!existing) {
    if (barrel.getLocal(START_FUNCTION_NAME)) {
      return undefined;
    }
    return barrel.addFunction({
      name: START_FUNCTION_NAME,
      isExported: true,
      isAsync: true,
      returnType: "Promise<void>",
    });
  }
  if (!existing.isExported() || !existing.getBody()) {
    return undefined;
  }
  if (!existing.isAsync()) {
    existing.setIsAsync(true);
    const returnType = existing.getReturnTypeNode();
    if (returnType?.getKind() === SyntaxKind.VoidKeyword) {
      existing.setReturnType("Promise<void>");
    }
  }
  return existing;
}

/** Whether `start` can return before a statement added at the end of its body runs. */
function returnsBeforeItsEnd(start: FunctionDeclaration): boolean {
  return start
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .some(
      (statement) =>
        statement.getFirstAncestor((node) =>
          Node.isFunctionLikeDeclaration(node),
        ) === start,
    );
}

function registrationCalls(scope: Node): CallExpression[] {
  return scope
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(
      (call) => call.getExpression().getText() === REGISTER_FUNCTION_NAME,
    );
}

function isFrontendModuleCall(argument: Node | undefined): boolean {
  return (
    Node.isCallExpression(argument) &&
    argument.getExpression().getText() === FRONTEND_MODULE_FUNCTION
  );
}

/** Where the barrel imports `frontendModule` from, as the source file it resolves to. */
function importedModuleFile(barrel: SourceFile): SourceFile | undefined {
  return barrel
    .getImportDeclarations()
    .find((declaration) =>
      declaration
        .getNamedImports()
        .some((specifier) => specifier.getName() === FRONTEND_MODULE_FUNCTION),
    )
    ?.getModuleSpecifierSourceFile();
}

/** What `start()` registers at the layer: nothing, the builder's earlier literal, or the module. */
type StartRegistration =
  | { kind: "absent" }
  | { kind: "literal"; call: CallExpression; literal: Node }
  | { kind: "module" }
  | { kind: "unknown" };

function registrationOf(
  barrel: SourceFile,
  start: FunctionDeclaration,
  registration: LayerRegistration,
): StartRegistration {
  const inStart = registrationCalls(start);
  for (const call of inStart) {
    const [argument] = call.getArguments();
    if (isFrontendModuleCall(argument)) {
      return { kind: "module" };
    }
    if (
      Node.isObjectLiteralExpression(argument) &&
      argument
        .getText()
        .includes(JSON.stringify(registration.runtimeRelativePath))
    ) {
      return { kind: "literal", call, literal: argument };
    }
  }
  return registrationCalls(barrel).length === 0
    ? { kind: "absent" }
    : { kind: "unknown" };
}

function addFrontendModuleImport(barrel: SourceFile): void {
  barrel.addImportDeclaration({
    moduleSpecifier: FRONTEND_MODULE_SPECIFIER,
    namedImports: [FRONTEND_MODULE_FUNCTION],
  });
}

function createFrontendModule(
  project: Project,
  transaction: Transaction,
  filePath: string,
  source: string,
): SourceFile {
  const file = project.createSourceFile(filePath, source);
  file.formatText();
  transaction.track(file, true);
  return file;
}

function declaration(
  root: string,
  main: string,
  barrel: SourceFile,
  moduleFile: string,
): Declaration {
  const compiled = compiledModulePath(
    main,
    path.relative(path.dirname(barrel.getFilePath()), moduleFile),
  );
  const text = manifestWithDeclaration(root, compiled);
  return text === undefined
    ? refusal(`${manifestPath(root)} cannot be read as a package manifest`)
    : { ok: true, manifest: { path: manifestPath(root), text } };
}

/**
 * Declares the layer as the project's frontend module, whatever state the
 * project is in, so the result is the same and a second call changes nothing:
 * the registration lives in `frontend-module.ts`, `start()` passes it to
 * `AddFrontendModule`, and `package.json` names its compiled file as
 * `dmsFrontend`. A `start()` that registers the layer with an object literal
 * (what the builder wrote before it declared the module) has that literal
 * moved into the file. Refuses a project whose `start()` cannot run to its
 * end, that has no `main`, or that registers a frontend module in a way it
 * does not recognize, and edits nothing then.
 *
 * Tracks what it edits in `transaction`, to be committed or rolled back by
 * the caller, and returns the `package.json` text to write beside it.
 */
export function declareLayer(
  project: Project,
  transaction: Transaction,
  barrel: SourceFile,
  root: string,
  registration: LayerRegistration,
): Declaration {
  const main = readManifest(root)?.main;
  if (!main) {
    return refusal(
      `${manifestPath(root)} has no main naming the compiled entry: the frontend loader reads the frontend module from compiled JavaScript, so add one (for example "dist/index.js")`,
    );
  }
  transaction.track(barrel);
  const start = ensureAsyncStartFunction(barrel);
  if (!start) {
    return refusal(
      `${path.relative(root, barrel.getFilePath())} has no exported start() function the builder can register the layer at the end of: add one, or move its return statements so it runs to its end`,
    );
  }
  const current = registrationOf(barrel, start, registration);
  if (current.kind === "unknown") {
    return refusal(
      `${path.relative(root, barrel.getFilePath())} registers a frontend module the builder cannot rewrite: declare it by hand, with a ${FRONTEND_MODULE_FUNCTION}() function in a file that package.json names as "dmsFrontend"`,
    );
  }
  if (current.kind === "module") {
    const moduleFile = importedModuleFile(barrel);
    return moduleFile
      ? declaration(root, main, barrel, moduleFile.getFilePath())
      : refusal(
          `${path.relative(root, barrel.getFilePath())} calls ${FRONTEND_MODULE_FUNCTION}() without importing it from a file of the project`,
        );
  }
  const moduleFilePath = path.join(
    path.dirname(barrel.getFilePath()),
    FRONTEND_MODULE_FILE,
  );
  if (project.getSourceFile(moduleFilePath) || fs.existsSync(moduleFilePath)) {
    return refusal(
      `${path.relative(root, moduleFilePath)} already exists but ${path.relative(root, barrel.getFilePath())} does not pass it to ${REGISTER_FUNCTION_NAME}: call ${REGISTER_FUNCTION_NAME}(${FRONTEND_MODULE_FUNCTION}()) from start(), or remove the file for the builder to write it`,
    );
  }
  if (barrel.getLocal(FRONTEND_MODULE_FUNCTION)) {
    return refusal(
      `${path.relative(root, barrel.getFilePath())} already binds the name ${FRONTEND_MODULE_FUNCTION}`,
    );
  }
  if (current.kind === "absent" && returnsBeforeItsEnd(start)) {
    return refusal(
      `${path.relative(root, barrel.getFilePath())} has no exported start() function the builder can register the layer at the end of: add one, or move its return statements so it runs to its end`,
    );
  }
  const used = referencedImportNames(barrel);
  if (current.kind === "literal") {
    const literal = current.literal.getText();
    createFrontendModule(
      project,
      transaction,
      moduleFilePath,
      frontendModuleSource(literal, pathImportUsedBy(barrel, literal)),
    );
    current.literal.replaceWithText(`${FRONTEND_MODULE_FUNCTION}()`);
    start.formatText();
  } else {
    createFrontendModule(
      project,
      transaction,
      moduleFilePath,
      frontendModuleSource(
        canonicalLiteral(registration),
        CANONICAL_PATH_IMPORT,
      ),
    );
    ensureRegisterFunctionImport(barrel);
    start.addStatements(
      `await ${REGISTER_FUNCTION_NAME}(${FRONTEND_MODULE_FUNCTION}());`,
    );
  }
  addFrontendModuleImport(barrel);
  pruneUnusedImports(barrel, used);
  return declaration(root, main, barrel, moduleFilePath);
}
