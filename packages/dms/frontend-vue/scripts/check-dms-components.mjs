import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DMS_PREFIX = "Dms";
const DMS_LAYERS = fileURLToPath(new URL("../layers", import.meta.url));
const DMS_NAME = /^(?:Dms[A-Z]|dms-[a-z])/;
const SKIP = new Set(["node_modules", "dist", "tests", "test", "fixtures"]);
const SKIPPED_FILE = /\.(?:test|spec|d)\.[cm]?ts$/;
const ELEMENT = 1;
const COMPONENT_TAG = 1;
const ATTRIBUTE = 6;

const COMPONENT_FILE = /\/app\/(?:build\/)?components\/(?:.*\/)?([^/]+)\.vue$/;
const PAGE_FILE = /\/app\/custom-pages\/(.+?)(?:\/index)?\.vue$/;
const LAYOUT_FILE = /\/app\/custom-layouts\/(.+)\.vue$/;

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

/** A file path as dms.frontend.ts names its component: `notice-banner.vue` is `NoticeBanner`. */
function pascalCase(name) {
  return name
    .replace(/\.vue$/, "")
    .split(/[./_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

/** The last name Vue's `resolveComponent` tries for a tag: `dms-card-panel` is `DmsCardPanel`. */
function vueName(name) {
  const camel = name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
  return `${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

/** A component name as the renderer's `resolveDmsComponent` compares it. */
function componentKey(name) {
  return name
    .replace(/^lazy/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/** A layout name as the renderer's `registerLayout` compares it. */
function layoutKey(name) {
  return componentKey(name.replace(/^lazy/i, "").replace(/^dms[-_]?/i, ""));
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

/**
 * The components and layouts a `dms.frontend.ts` registers from the `.vue`
 * files under `root`, before its prefix: the file name of a component under
 * `app/components/` or `app/build/components/`, the path below
 * `app/custom-pages/` of a custom page, the path below `app/custom-layouts/`
 * of a layout.
 */
function registeredFiles(root, skip = new Set()) {
  const components = [];
  const layouts = [];
  for (const path of files(root, (file) => file.endsWith(".vue"))) {
    const file = relative(root, path).split(sep).join("/");
    if (skip.has(file)) continue;
    const component = (COMPONENT_FILE.exec(`/${file}`) ??
      PAGE_FILE.exec(`/${file}`))?.[1];
    if (component) components.push(pascalCase(component));
    const layout = LAYOUT_FILE.exec(`/${file}`)?.[1];
    if (layout) layouts.push(layout);
  }
  return { components, layouts };
}

/**
 * The names the installed `@antelopejs/dms` registers, as its
 * `dms.frontend.ts` does: each component with its `Dms` prefix and aliases,
 * and each layout.
 */
export function dmsRegistrations() {
  const { components, layouts } = registeredFiles(
    DMS_LAYERS,
    UNREGISTERED_DMS_FILES,
  );
  return {
    components: new Set(
      components.flatMap((name) =>
        [name, DMS_ALIASES[name]]
          .filter(Boolean)
          .map((registered) => DMS_PREFIX + registered),
      ),
    ),
    layouts: new Set(layouts),
  };
}

function dependencies(layer) {
  const manifest = join(layer, "package.json");
  if (!existsSync(manifest)) throw new Error(`No package.json in ${layer}`);
  const require = createRequire(manifest);
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

function parseScript(file, source, ts) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function unwrap(node, ts) {
  let inner = node;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner) ||
    ts.isNonNullExpression(inner) ||
    ts.isTypeAssertionExpression(inner)
  )
    inner = inner.expression;
  return inner;
}

function literalText(node, ts) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

/** Every `const NAME = "text"` of a file, by name. */
function constantStrings(tree, ts) {
  const values = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      node.parent.flags & ts.NodeFlags.Const
    ) {
      const text = literalText(unwrap(node.initializer, ts), ts);
      if (text !== undefined) values.set(node.name.text, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return values;
}

/** A string literal, or a const of the same file holding one. */
function stringOf(node, constants, ts) {
  if (!node) return undefined;
  const value = unwrap(node, ts);
  return ts.isIdentifier(value)
    ? constants.get(value.text)
    : literalText(value, ts);
}

function nameOf(node, ts) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
}

function isBanner(object, ts) {
  const keys = new Set(object.properties.map((p) => nameOf(p.name, ts)));
  return keys.has("key") && keys.has("variant");
}

/**
 * What a node names by string: a component Vue resolves (`resolveComponent`),
 * one an interface-dms builder takes (`CustomComponent`, `new
 * ComponentBuilder`, a `componentName` property, a layout banner's
 * `component`), or one the layer registers.
 */
function namedString(node, ts) {
  const callee =
    (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
    nameOf(node.expression, ts);
  const argument = callee && node.arguments?.[0];
  if (callee === "resolveComponent") return { kind: "vue", node: argument };
  if (
    callee === "CustomComponent" ||
    (callee === "ComponentBuilder" && ts.isNewExpression(node))
  )
    return { kind: "builder", node: argument };
  if (callee === "registerComponent" || callee === "registerLayout")
    return { kind: callee, node: argument };
  if (!ts.isPropertyAssignment(node)) return undefined;
  const property = nameOf(node.name, ts);
  return property === "componentName" ||
    (property === "component" && isBanner(node.parent, ts))
    ? { kind: "builder", node: node.initializer }
    : undefined;
}

/** The component names a script names by string, with the offset of each. */
function scriptStrings(tree, ts) {
  const constants = constantStrings(tree, ts);
  const found = [];
  const visit = (node) => {
    const named = namedString(node, ts);
    const name = named && stringOf(named.node, constants, ts);
    if (name)
      found.push({ kind: named.kind, name, offset: named.node.getStart(tree) });
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

/** The names a script declares at its top level, which its template may use as tags. */
function scriptBindings(tree, ts) {
  return tree.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) return [];
      const named = clause.namedBindings;
      return [
        ...(clause.name ? [clause.name.text] : []),
        ...(named && ts.isNamedImports(named)
          ? named.elements
              .filter((element) => !element.isTypeOnly)
              .map((element) => element.name.text)
          : []),
      ];
    }
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
      );
    return (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)) &&
      statement.name
      ? [statement.name.text]
      : [];
  });
}

function templateUses(node) {
  const children = (node.children ?? []).flatMap(templateUses);
  if (node.type !== ELEMENT) return children;
  const is = node.props.find(
    (prop) => prop.type === ATTRIBUTE && prop.name === "is" && prop.value,
  );
  const tag = node.tagType === COMPONENT_TAG ? node.tag : undefined;
  const name = node.tag === "component" ? is?.value.content : tag;
  return name
    ? [{ kind: "vue", name, line: node.loc.start.line }, ...children]
    : children;
}

/** What one source file names by string or tag, with the line of each. */
function fileStrings({ file, source }, tools) {
  if (!file.endsWith(".vue"))
    return scriptStrings(parseScript(file, source, tools.ts), tools.ts).map(
      ({ offset, ...use }) => ({ ...use, file, line: lineAt(source, offset) }),
    );
  const { descriptor, errors } = tools.parse(source, { filename: file });
  if (errors.length)
    throw new Error(`Cannot parse ${file}: ${errors.join(", ")}`);
  const scripts = [descriptor.script, descriptor.scriptSetup]
    .filter(Boolean)
    .map((block) => ({
      block,
      tree: parseScript(file, block.content, tools.ts),
    }));
  const bound = new Set(
    scripts.flatMap(({ tree }) => scriptBindings(tree, tools.ts)).map(vueName),
  );
  const tags = descriptor.template?.ast
    ? templateUses(descriptor.template.ast).filter(
        ({ name }) => !bound.has(vueName(name)),
      )
    : [];
  return [
    ...tags.map((use) => ({ ...use, file })),
    ...scripts.flatMap(({ block, tree }) =>
      scriptStrings(tree, tools.ts).map(({ offset, ...use }) => ({
        ...use,
        file,
        line: lineAt(source, block.loc.start.offset + offset),
      })),
    ),
  ];
}

/** The `componentPrefix` of the layer's `dms.frontend.ts`: a string literal, or a const of that file holding one. */
function layerPrefix(layer, ts) {
  const entry = join(layer, "dms.frontend.ts");
  if (!existsSync(entry)) return "";
  const tree = parseScript(entry, readFileSync(entry, "utf8"), ts);
  const constants = constantStrings(tree, ts);
  let declared;
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      nameOf(node.name, ts) === "componentPrefix"
    )
      declared = { prefix: stringOf(node.initializer, constants, ts) };
    if (
      ts.isShorthandPropertyAssignment(node) &&
      node.name.text === "componentPrefix"
    )
      declared = { prefix: constants.get("componentPrefix") };
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (declared && declared.prefix === undefined)
    throw new Error(
      `${entry}: write componentPrefix as a string, or a const of that file holding one, so that the DMS component check reads it`,
    );
  return declared?.prefix ?? "";
}

function readSources(roots, pattern) {
  return roots
    .flatMap((root) => {
      if (!existsSync(root)) throw new Error(`No such source: ${root}`);
      return statSync(root).isDirectory()
        ? files(root, (path) => pattern.test(path) && !SKIPPED_FILE.test(path))
        : [root];
    })
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

/** The names Vue and the renderer resolve, from dms, the renderer and the layer. */
async function knownNames(root, layerStrings, tools) {
  const dms = dmsRegistrations();
  const prefix = layerPrefix(root, tools.ts);
  const own = registeredFiles(root);
  const registered = (kind) =>
    layerStrings.filter((use) => use.kind === kind).map(({ name }) => name);
  const tags = new Set([
    ...dms.components,
    ...(await rendererComponentNames(tools.rendererGlobals)),
    ...own.components.map((name) => prefix + name),
    ...registered("registerComponent").flatMap((name) => [
      name,
      prefix + vueName(name),
    ]),
  ]);
  return {
    tags,
    components: new Set([...tags].map(componentKey)),
    layouts: new Set(
      [...dms.layouts, ...own.layouts, ...registered("registerLayout")].map(
        layoutKey,
      ),
    ),
  };
}

function isKnown({ kind, name }, known) {
  if (kind === "vue")
    return known.tags.has(name) || known.tags.has(vueName(name));
  return (
    known.components.has(componentKey(name)) ||
    known.layouts.has(layoutKey(name))
  );
}

/**
 * Every place the layer names a `Dms` component that neither the installed
 * `@antelopejs/dms`, the installed `@antelopejs/dms-frontend` nor the layer
 * registers: a tag, static `is` or `resolveComponent` string in one of its
 * files, or a string an interface-dms builder takes as a component name in
 * the layer or in `sources` (the module's backend directories). Vue renders
 * an unknown tag as an empty element, with no error. Each diagnostic names
 * the file, the line and the name.
 */
export async function checkDmsComponents({ layer, sources = [] }) {
  const root = resolve(layer);
  const tools = dependencies(root);
  const layerFiles = readSources([root], /\.(?:vue|[cm]?ts)$/);
  const layerStrings = layerFiles.flatMap((file) => fileStrings(file, tools));
  const known = await knownNames(root, layerStrings, tools);
  const read = new Set(layerFiles.map(({ file }) => file));
  const sourceStrings = readSources(
    sources.map((source) => resolve(source)),
    /\.[cm]?ts$/,
  )
    .filter(({ file }) => !read.has(file))
    .flatMap((file) => fileStrings(file, tools));
  return [...layerStrings, ...sourceStrings]
    .filter(({ kind }) => kind === "vue" || kind === "builder")
    .filter((use) => DMS_NAME.test(use.name) && !isKnown(use, known))
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
