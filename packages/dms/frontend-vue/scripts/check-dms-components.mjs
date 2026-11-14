import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DMS_PREFIX = "Dms";
const DMS_LAYERS = fileURLToPath(new URL("../layers", import.meta.url));
const DMS_NAME = /^(?:Dms[A-Z]|dms-[a-z])/;
const SKIP = new Set(["node_modules", "dist", "tests", "test", "fixtures"]);
const ELEMENT = 1;
const COMPONENT_TAG = 1;
const ATTRIBUTE = 6;

/** Layer files dms.frontend.ts leaves out of its component globs. */
const UNREGISTERED_DMS_FILES = new Set([
  "dms-ui/app/components/form/components/ImagePresentation.vue",
  "dms-ui/app/build/components/table/TableBody.vue",
]);

/** The second names dms.frontend.ts registers some components under. */
const DMS_ALIASES = {
  ActivityFeed: "ActivityFeedBlock",
  SectionPanel: "SectionBlock",
  FieldRow: "FieldRowBlock",
};

/** `dms-card-panel` or `notice-banner.vue` as the name Vue resolves: `DmsCardPanel`, `NoticeBanner`. */
function pascalCase(name) {
  return name
    .replace(/\.vue$/, "")
    .split(/[./_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

/** A name as the component registry compares it: its letters and digits, lowercased. */
function lookupKey(name) {
  return name.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function files(root, keep) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) return [];
    const path = join(root, entry.name);
    if (entry.isDirectory()) return files(path, keep);
    return keep(path) ? [path] : [];
  });
}

function posixPath(root, path) {
  return relative(root, path).split(sep).join("/");
}

const REGISTERED_FILE =
  /\/app\/(?:(?:build\/)?components|custom-layouts)\/(?:.*\/)?([^/]+)\.vue$|\/app\/custom-pages\/(.+?)(?:\/index)?\.vue$/;

/**
 * The name a `dms.frontend.ts` registers a layer file under, before its
 * prefix: the file name of a component under `app/components/` or
 * `app/build/components/` and of a custom layout, the path below
 * `app/custom-pages/` of a custom page.
 */
function registeredFileName(path) {
  const match = REGISTERED_FILE.exec(path);
  if (!match) return undefined;
  return pascalCase(match[1] ?? match[2]);
}

function registeredFileNames(root, prefix, skip = new Set()) {
  return files(root, (path) => /\.vue$/.test(path)).flatMap((path) => {
    const file = posixPath(root, path);
    const name = skip.has(file) ? undefined : registeredFileName(`/${file}`);
    return name ? [prefix + name] : [];
  });
}

/**
 * Every name the installed `@antelopejs/dms` registers a component under, as
 * its `dms.frontend.ts` does, with the aliases it adds.
 */
export function dmsComponentNames() {
  const names = registeredFileNames(
    DMS_LAYERS,
    DMS_PREFIX,
    UNREGISTERED_DMS_FILES,
  );
  return new Set(
    names.flatMap((name) => {
      const alias = DMS_ALIASES[name.slice(DMS_PREFIX.length)];
      return alias ? [name, DMS_PREFIX + alias] : [name];
    }),
  );
}

function layerPackage(layer) {
  const manifest = join(layer, "package.json");
  if (!existsSync(manifest)) throw new Error(`No package.json in ${layer}`);
  return manifest;
}

function dependencies(layer) {
  const require = createRequire(layerPackage(layer));
  try {
    return {
      ts: require("typescript"),
      parse: require("vue/compiler-sfc").parse,
      rendererGlobals: require.resolve(
        "@antelopejs/dms-frontend/eslint-globals",
      ),
    };
  } catch (error) {
    throw new Error(
      `Install typescript, vue and @antelopejs/dms-frontend in ${layer} to check its DMS components`,
      { cause: error },
    );
  }
}

/** The `Dms` components the `@antelopejs/dms-frontend` renderer registers itself. */
async function rendererComponentNames(globalsPath) {
  const { default: globals } = await import(pathToFileURL(globalsPath).href);
  return Object.keys(globals).filter((name) => /^Dms[A-Z]/.test(name));
}

/**
 * The names the layer registers its own components under: its
 * `componentPrefix` before the name of each component, custom page and custom
 * layout file, and each name it passes to `registerComponent`, with and
 * without the prefix.
 */
function layerComponentNames(layer, sources) {
  const entry = join(layer, "dms.frontend.ts");
  const setup = existsSync(entry) ? readFileSync(entry, "utf8") : "";
  const prefix =
    /componentPrefix\s*:\s*["'`]([A-Za-z0-9]*)["'`]/.exec(setup)?.[1] ?? "";
  const filed = registeredFileNames(layer, prefix);
  const registered = sources
    .filter(({ file }) => /\.[cm]?ts$/.test(file))
    .flatMap(({ source }) => [
      ...source.matchAll(/registerComponent\(\s*["'`]([A-Za-z0-9-]+)["'`]/g),
    ])
    .flatMap(([, name]) => [pascalCase(name), prefix + pascalCase(name)]);
  return [...filed, ...registered];
}

function importedNames(script, ts) {
  const tree = ts.createSourceFile("script.ts", script, ts.ScriptTarget.Latest);
  return tree.statements.filter(ts.isImportDeclaration).flatMap((node) => {
    const clause = node.importClause;
    if (!clause) return [];
    const named = clause.namedBindings;
    return [
      ...(clause.name ? [clause.name.text] : []),
      ...(named && ts.isNamedImports(named)
        ? named.elements.map((element) => element.name.text)
        : []),
    ];
  });
}

function templateUses(node) {
  const children = (node.children ?? []).flatMap(templateUses);
  if (node.type !== ELEMENT) return children;
  const is = node.props.find(
    (prop) => prop.type === ATTRIBUTE && prop.name === "is" && prop.value,
  );
  const name =
    node.tag === "component"
      ? is?.value.content
      : node.tagType === COMPONENT_TAG
        ? node.tag
        : undefined;
  return name && DMS_NAME.test(name)
    ? [{ name, line: node.loc.start.line }, ...children]
    : children;
}

/** The `Dms` components a `.vue` file renders by tag or by a static `is`, less the ones its scripts import. */
function vueComponentUses(file, source, { parse, ts }) {
  const { descriptor, errors } = parse(source, { filename: file });
  if (errors.length)
    throw new Error(`Cannot parse ${file}: ${errors.join(", ")}`);
  const imported = new Set(
    [descriptor.script, descriptor.scriptSetup]
      .filter(Boolean)
      .flatMap((block) => importedNames(block.content, ts))
      .map(lookupKey),
  );
  return descriptor.template?.ast
    ? templateUses(descriptor.template.ast).filter(
        ({ name }) => !imported.has(lookupKey(name)),
      )
    : [];
}

function stringValue(node, ts) {
  return node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node
    : undefined;
}

function calleeName(expression, ts) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

/**
 * The string an interface-dms builder takes as a component name: the argument
 * of `CustomComponent` and `new ComponentBuilder`, and a `componentName` or
 * `component` property.
 */
function componentNameString(node, ts) {
  if (
    (ts.isCallExpression(node) &&
      calleeName(node.expression, ts) === "CustomComponent") ||
    (ts.isNewExpression(node) &&
      calleeName(node.expression, ts) === "ComponentBuilder")
  )
    return stringValue(node.arguments?.[0], ts);
  if (
    ts.isPropertyAssignment(node) &&
    ["componentName", "component"].includes(
      ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
        ? node.name.text
        : "",
    )
  )
    return stringValue(node.initializer, ts);
  return undefined;
}

/** The `Dms` components a TypeScript file names where an interface-dms builder takes a component name. */
function builderComponentUses(file, source, ts) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const uses = [];
  const visit = (node) => {
    const literal = componentNameString(node, ts);
    if (literal && DMS_NAME.test(literal.text))
      uses.push({
        name: literal.text,
        line: tree.getLineAndCharacterOfPosition(literal.getStart()).line + 1,
      });
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return uses;
}

function readSources(roots, pattern) {
  return roots
    .flatMap((root) =>
      statSync(root).isDirectory()
        ? files(
            root,
            (path) =>
              pattern.test(path) && !/\.(?:test|spec|d)\.[cm]?ts$/.test(path),
          )
        : [root],
    )
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

/**
 * Every place the layer names a `Dms` component that neither the installed
 * `@antelopejs/dms`, the installed `@antelopejs/dms-frontend` nor the layer
 * registers: a tag or static `is` in one of its `.vue` files, or a string an
 * interface-dms builder takes as a component name in a TypeScript file of
 * `sources` (the module's backend directories). Vue renders an unknown tag
 * as an empty element, with no error. Each diagnostic names the file, the
 * line and the name.
 */
export async function checkDmsComponents({ layer, sources = [] }) {
  const root = resolve(layer);
  const tools = dependencies(root);
  const layerFiles = readSources([root], /\.(?:vue|[cm]?ts)$/);
  const known = new Set(
    [
      ...dmsComponentNames(),
      ...(await rendererComponentNames(tools.rendererGlobals)),
      ...layerComponentNames(root, layerFiles),
    ].map(lookupKey),
  );
  const uses = [
    ...layerFiles
      .filter(({ file }) => file.endsWith(".vue"))
      .flatMap(({ file, source }) =>
        vueComponentUses(file, source, tools).map((use) => ({ file, ...use })),
      ),
    ...readSources(
      sources.map((source) => resolve(source)),
      /\.[cm]?ts$/,
    ).flatMap(({ file, source }) =>
      builderComponentUses(file, source, tools.ts).map((use) => ({
        file,
        ...use,
      })),
    ),
  ];
  return uses
    .filter(({ name }) => !known.has(lookupKey(name)))
    .map(
      ({ file, line, name }) =>
        `${relative(process.cwd(), file)}:${line}: \`${name}\` is no component the installed @antelopejs/dms, @antelopejs/dms-frontend or this layer registers`,
    );
}

/** Rejects with every diagnostic of {@link checkDmsComponents}, one per line. */
export async function assertDmsComponents(options) {
  const diagnostics = await checkDmsComponents(options);
  if (diagnostics.length) throw new Error(diagnostics.join("\n"));
}
