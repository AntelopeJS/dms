import { readFileSync, globSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parse } from "vue/compiler-sfc";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(frontend, "../../..");
const require = createRequire(import.meta.url);
const rules = require("../../../../.dependency-cruiser/frontend.cjs").forbidden;
const importer = createRequire(require.resolve("unplugin-auto-import"));
const { scanDirExports } = importer("unimport");
const loader = join(
  dirname(require.resolve("@antelopejs/dms-frontend/package.json")),
  "templates/vue/frontend-build-loader.ts",
);
const compiled = ts.transpileModule(readFileSync(loader, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaderExports = {};
new Function("require", "exports", compiled)(
  createRequire(loader),
  loaderExports,
);
const { autoImportDirectories } = loaderExports;
const declaration = ts.createSourceFile(
  "build.ts",
  readFileSync(join(frontend, "dms.frontend.build.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const directories = [];
function declared(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "registerAutoImports"
  ) {
    const entries = node.arguments[0];
    if (
      !ts.isArrayLiteralExpression(entries) ||
      !entries.elements.every(ts.isStringLiteral)
    )
      throw new Error(
        "Auto-import audit requires literal declared directories",
      );
    directories.push(...entries.elements.map((entry) => entry.text));
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
const owners = new Map();
const components = new Map();
function own(name, file, registry = owners) {
  const layer = /\/layers\/dms-([^/]+)\//.exec(file)?.[1];
  if (!layer) return;
  const entries = registry.get(name) ?? new Set();
  entries.add(file);
  registry.set(name, entries);
}
for (const item of await scanDirExports(globs))
  own(item.as ?? item.name, item.from);
const registry = ts.createSourceFile(
  "registry.ts",
  readFileSync(join(frontend, "dms.frontend.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const componentGlobs = [];
const componentAliases = new Map();
const registryBindings = new Set();
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
  const bindings = new Map();
  const imports = new Map();
  const declarations = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
      bindings.set(node.name.text, node.initializer);
    if (
      ts.isImportDeclaration(node) &&
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
  const expression = (node) => {
    if (!node) return;
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "import.meta.glob"
    ) {
      const argument = node.arguments[0];
      const entries = ts.isArrayLiteralExpression(argument)
        ? [...argument.elements]
        : [argument];
      if (!entries.every(ts.isStringLiteral))
        throw new Error("Component audit requires literal discovery globs");
      componentGlobs.push({
        base: dirname(file),
        patterns: entries.map((entry) => entry.text),
      });
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
function registered(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText() === "COMPONENT_ALIASES" &&
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
      if (componentAliases.has(name))
        own(componentAliases.get(name), file, components);
    }
const sources = new Map();
const templateOffsets = new Map();
for (const file of globSync(
  join(frontend, "layers/**/*.{ts,tsx,js,mjs,vue}"),
)) {
  if (file.endsWith(".d.ts")) continue;
  let text = readFileSync(file, "utf8");
  if (file.endsWith(".vue")) {
    const { descriptor } = parse(text, { filename: file });
    const tags = [];
    const template = (node) => {
      if (node.type === 1 && node.tagType === 1) tags.push(node.tag);
      for (const child of node.children ?? []) template(child);
    };
    if (descriptor.template?.ast) template(descriptor.template.ast);
    text = [descriptor.script?.content, descriptor.scriptSetup?.content]
      .filter(Boolean)
      .join("\n");
    templateOffsets.set(file + ".audit.ts", text.length);
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
  sources.set(file + ".audit.ts", text + "\nexport {};");
}
const options = { noLib: true, noResolve: true };
const host = ts.createCompilerHost(options);
host.getSourceFile = (file, version) =>
  sources.has(file)
    ? ts.createSourceFile(file, sources.get(file), version, true)
    : undefined;
const program = ts.createProgram([...sources.keys()], options, host);
const checker = program.getTypeChecker();
function matches(condition, path) {
  return (
    (!condition.path || new RegExp(condition.path).test(path)) &&
    (!condition.pathNot || !new RegExp(condition.pathNot).test(path))
  );
}
let failures = 0;
function checkOwner(caller, name, owner) {
  for (const rule of rules) {
    if (
      rule.to.dependencyTypes?.includes("local") ||
      !matches(rule.from, caller) ||
      !matches(rule.to, relative(root, owner))
    )
      continue;
    console.error(
      `FAIL auto-import boundary ${caller} ${rule.name} ${name} -> ${relative(root, owner)}`,
    );
    failures++;
  }
}
for (const file of program.getSourceFiles()) {
  const caller = relative(root, file.fileName.replace(/\.audit\.ts$/, ""));
  const visit = (node) => {
    const registry =
      node.pos >= (templateOffsets.get(file.fileName) ?? Infinity)
        ? components
        : owners;
    if (
      ts.isIdentifier(node) &&
      registry.has(node.text) &&
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
        for (const owner of registry.get(node.text)) {
          checkOwner(caller, node.text, owner);
        }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
if (failures) process.exitCode = 1;
else
  console.log(
    `PASS frontend generated auto-import and template owners (${owners.size} providers)`,
  );
