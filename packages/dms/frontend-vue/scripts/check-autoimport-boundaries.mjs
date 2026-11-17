import { readFileSync, globSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { parse } from "vue/compiler-sfc";

/**
 * @typedef {object} ScannedExport
 * @property {string} name
 * @property {string} from
 * @property {string} [as]
 */

/**
 * @typedef {object} UnimportModule
 * @property {(directories: string[]) => Promise<ScannedExport[]>} scanDirExports
 */

/**
 * @typedef {object} BuildRegistration
 * @property {(directories: string[]) => void} registerAutoImports
 */

/**
 * @typedef {object} LayerRoot
 * @property {string} id
 * @property {string} root
 */

/**
 * @typedef {object} LayerSetup
 * @property {string} id
 * @property {(build: BuildRegistration) => void} setup
 */

/**
 * @typedef {(layers: LayerRoot[], setups: LayerSetup[], fail: (message: string) => never) => string[]} AutoImportDirectories
 */

/** @typedef {NonNullable<NonNullable<import("vue/compiler-sfc").SFCDescriptor["template"]>["ast"]>} TemplateRoot */
/** @typedef {TemplateRoot | TemplateRoot["children"][number]} TemplateNode */
/** @typedef {{ base: string, patterns: string[] }} ComponentGlob */
/** @typedef {{ file: string, name: string }} NamedImport */

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(frontend, "../../..");
const require = createRequire(import.meta.url);
/** @param {string} path */
const posixPath = (path) => path.split(sep).join("/");
/** @type {(id: string) => import("../../../../.dependency-cruiser.cjs").Area} */
const loadArea = createRequire(import.meta.url);
const rules = loadArea(
  "../../../../.dependency-cruiser/frontend.cjs",
).forbidden;
/** @type {(id: string) => UnimportModule} */
const importer = createRequire(require.resolve("unplugin-auto-import"));
const { scanDirExports } = importer("unimport");
const loader = join(
  dirname(require.resolve("@antelopejs/dms-frontend/package.json")),
  "templates/vue/frontend-build-loader.ts",
);
const compiled = ts.transpileModule(readFileSync(loader, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
/** @type {{ autoImportDirectories?: AutoImportDirectories }} */
const loaderExports = {};
compileFunction(compiled, ["require", "exports"]).call(
  undefined,
  createRequire(loader),
  loaderExports,
);
const { autoImportDirectories } = loaderExports;
if (!autoImportDirectories)
  throw new Error(`${loader} does not export autoImportDirectories`);
const declaration = ts.createSourceFile(
  "build.ts",
  readFileSync(join(frontend, "dms.frontend.build.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
/**
 * @param {readonly ts.Node[]} nodes
 * @returns {string[] | undefined}
 */
function literalTexts(nodes) {
  const texts = [];
  for (const node of nodes) {
    if (!ts.isStringLiteral(node)) return undefined;
    texts.push(node.text);
  }
  return texts;
}
/** @type {string[]} */
const directories = [];
/** @param {ts.Node} node */
function declared(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "registerAutoImports"
  ) {
    const entries = node.arguments[0];
    const texts = ts.isArrayLiteralExpression(entries)
      ? literalTexts(entries.elements)
      : undefined;
    if (texts === undefined)
      throw new Error(
        "Auto-import audit requires literal declared directories",
      );
    directories.push(...texts);
  }
  ts.forEachChild(node, declared);
}
declared(declaration);
const globs = autoImportDirectories(
  [{ id: "frontend", root: frontend }],
  [
    {
      id: "frontend",
      setup: (build) => build.registerAutoImports(directories),
    },
  ],
  (message) => {
    throw new Error(message);
  },
);
/** @type {Map<string, Set<string>>} */
const owners = new Map();
/** @type {Map<string, Set<string>>} */
const components = new Map();
/**
 * @param {string} name
 * @param {string} path
 * @param {Map<string, Set<string>>} [registry]
 */
function own(name, path, registry = owners) {
  const file = posixPath(path);
  const layer = /\/layers\/dms-([^/]+)\//.exec(file)?.[1];
  if (!layer) return;
  const entries = registry.get(name) ?? new Set();
  entries.add(file);
  registry.set(name, entries);
}
/** @type {string[]} */
const unresolved = [];
const warn = console.warn;
/** @param {unknown[]} args */
console.warn = (...args) => {
  const message = args.join(" ");
  if (message.startsWith("[unimport]")) unresolved.push(message);
  else warn(...args);
};
/** @type {ScannedExport[]} */
let scanned;
try {
  scanned = await scanDirExports(globs);
} finally {
  console.warn = warn;
}
for (const message of unresolved) {
  console.error(`FAIL auto-import scan ${message}`);
  process.exitCode = 1;
}
for (const item of scanned) own(item.as ?? item.name, item.from);
const registry = ts.createSourceFile(
  "registry.ts",
  readFileSync(join(frontend, "dms.frontend.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
/** @type {ComponentGlob[]} */
const componentGlobs = [];
/** @type {Map<string, string>} */
const componentAliases = new Map();
/** @type {Set<string>} */
const registryBindings = new Set();
/**
 * @param {string} file
 * @param {string} name
 */
function registryBinding(file, name) {
  const key = `${file}:${name}`;
  if (registryBindings.has(key)) return;
  registryBindings.add(key);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  /** @type {Map<string, ts.Expression | undefined>} */
  const bindings = new Map();
  /** @type {Map<string, NamedImport>} */
  const imports = new Map();
  /** @param {ts.Node} node */
  const declarations = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
      bindings.set(node.name.text, node.initializer);
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named))
        for (const item of named.elements)
          imports.set(item.name.text, {
            file: resolve(dirname(file), node.moduleSpecifier.text) + ".ts",
            name: (item.propertyName ?? item.name).text,
          });
    }
    ts.forEachChild(node, declarations);
  };
  declarations(source);
  /** @param {ts.Node | undefined} node */
  const expression = (node) => {
    if (!node) return;
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "import.meta.glob"
    ) {
      const argument = node.arguments[0];
      const patterns = literalTexts(
        ts.isArrayLiteralExpression(argument)
          ? [...argument.elements]
          : [argument],
      );
      if (patterns === undefined)
        throw new Error("Component audit requires literal discovery globs");
      componentGlobs.push({ base: dirname(file), patterns });
      return;
    }
    if (ts.isIdentifier(node)) {
      const imported = imports.get(node.text);
      if (imported) registryBinding(imported.file, imported.name);
      else if (bindings.has(node.text)) registryBinding(file, node.text);
    }
    ts.forEachChild(node, expression);
  };
  expression(bindings.get(name));
}
/** @param {ts.Node} node */
function registered(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText() === "COMPONENT_ALIASES" &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    for (const property of node.initializer.properties)
      if (
        ts.isPropertyAssignment(property) &&
        ts.isStringLiteral(property.initializer)
      )
        componentAliases.set(
          property.name.getText(),
          property.initializer.text,
        );
  }
  ts.forEachChild(node, registered);
}
registered(registry);
registryBinding(join(frontend, "dms.frontend.ts"), "components");
if (!componentGlobs.length)
  throw new Error("No component discovery globs found");
for (const { base, patterns } of componentGlobs)
  for (const pattern of patterns.filter((entry) => !entry.startsWith("!")))
    for (const file of globSync(resolve(base, pattern), {
      exclude: patterns
        .filter((entry) => entry.startsWith("!"))
        .map((entry) => resolve(base, entry.slice(1))),
    })) {
      const name = basename(file, ".vue")
        .split(/[._-]+/)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join("");
      own(name, file, components);
      const alias = componentAliases.get(name);
      if (alias !== undefined) own(alias, file, components);
    }
/** @type {Map<string, string>} */
const sources = new Map();
/** @type {Map<string, number>} */
const templateOffsets = new Map();
for (const file of globSync(
  join(frontend, "layers/**/*.{ts,tsx,js,mjs,vue}"),
)) {
  if (file.endsWith(".d.ts")) continue;
  let text = readFileSync(file, "utf8");
  if (file.endsWith(".vue")) {
    const { descriptor } = parse(text, { filename: file });
    /** @type {string[]} */
    const tags = [];
    /** @param {TemplateNode} node */
    const template = (node) => {
      if (node.type === 1 && node.tagType === 1) tags.push(node.tag);
      if (node.type === 0 || node.type === 1)
        for (const child of node.children) template(child);
    };
    if (descriptor.template?.ast) template(descriptor.template.ast);
    text = [descriptor.script?.content, descriptor.scriptSetup?.content]
      .filter(Boolean)
      .join("\n");
    templateOffsets.set(posixPath(file) + ".audit.ts", text.length);
    text +=
      "\n" +
      tags
        .map(
          (tag) =>
            `;${
              tag.includes("-")
                ? tag
                    .split("-")
                    .map((word) => word[0].toUpperCase() + word.slice(1))
                    .join("")
                : tag
            };`,
        )
        .join("\n");
  }
  sources.set(posixPath(file) + ".audit.ts", text + "\nexport {};");
}
const options = { noLib: true, noResolve: true };
const host = ts.createCompilerHost(options);
/**
 * @param {string} file
 * @param {ts.ScriptTarget | ts.CreateSourceFileOptions} version
 */
host.getSourceFile = (file, version) => {
  const text = sources.get(file);
  return text === undefined
    ? undefined
    : ts.createSourceFile(file, text, version, true);
};
const program = ts.createProgram([...sources.keys()], options, host);
const checker = program.getTypeChecker();
/**
 * @param {(typeof rules)[number]["from"]} condition
 * @param {string} path
 */
function matches(condition, path) {
  return (
    (!condition.path || new RegExp(String(condition.path)).test(path)) &&
    (!condition.pathNot || !new RegExp(String(condition.pathNot)).test(path))
  );
}
/** @param {(typeof rules)[number]["to"]} to */
function requiresLocalDependency(to) {
  return (
    "dependencyTypes" in to &&
    Array.isArray(to.dependencyTypes) &&
    to.dependencyTypes.includes("local")
  );
}
let failures = 0;
/**
 * @param {string} caller
 * @param {string} name
 * @param {string} owner
 */
function checkOwner(caller, name, owner) {
  const target = posixPath(relative(root, owner));
  for (const rule of rules) {
    if (
      requiresLocalDependency(rule.to) ||
      !matches(rule.from, caller) ||
      !matches(rule.to, target)
    )
      continue;
    console.error(
      `FAIL auto-import boundary ${caller} ${rule.name} ${name} -> ${target}`,
    );
    failures++;
  }
}
for (const file of program.getSourceFiles()) {
  const caller = posixPath(
    relative(root, file.fileName.replace(/\.audit\.ts$/, "")),
  );
  /** @param {ts.Node} node */
  const visit = (node) => {
    const registry =
      node.pos >= (templateOffsets.get(file.fileName) ?? Infinity)
        ? components
        : owners;
    const holders = ts.isIdentifier(node) ? registry.get(node.text) : undefined;
    if (
      ts.isIdentifier(node) &&
      holders &&
      !checker.getSymbolAtLocation(node)
    ) {
      const parent = node.parent;
      const property =
        (ts.isPropertyAccessExpression(parent) ||
          ts.isPropertyAssignment(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertySignature(parent)) &&
        parent.name === node;
      if (!property)
        for (const owner of holders) {
          checkOwner(caller, node.text, owner);
        }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
if (failures) process.exitCode = 1;
else if (!unresolved.length)
  console.log(
    `PASS frontend generated auto-import and template owners (${owners.size} providers)`,
  );
