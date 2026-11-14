import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addCommand,
  dependencies,
  RENDERER,
  rendererComponentNames,
} from "./dms-components-dependencies.mjs";

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
  return name
    .replace(/^lazy/i, "")
    .replace(/^dms[-_]?/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
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

function bindingNames(name, ts) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name, ts),
  );
}

/**
 * What the statements of one scope declare under `name`: the text of a
 * `const` holding a string, `{}` for any other declaration, or nothing.
 */
function declaredIn(statements, name, ts) {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations) {
        if (!bindingNames(declaration.name, ts).includes(name)) continue;
        const constant =
          statement.declarationList.flags & ts.NodeFlags.Const &&
          ts.isIdentifier(declaration.name) &&
          declaration.initializer;
        return {
          text: constant
            ? literalText(unwrap(declaration.initializer, ts), ts)
            : undefined,
        };
      }
    const imported = ts.isImportDeclaration(statement)
      ? [
          statement.importClause?.name,
          ...(statement.importClause?.namedBindings?.elements ?? []),
        ]
      : [statement.name];
    if (
      imported.some((binding) => nameOf(binding?.name ?? binding, ts) === name)
    )
      return {};
  }
  return undefined;
}

function shadows(scope, name, ts) {
  const loop =
    (ts.isForStatement(scope) ||
      ts.isForOfStatement(scope) ||
      ts.isForInStatement(scope)) &&
    scope.initializer &&
    ts.isVariableDeclarationList(scope.initializer);
  const declarations = [
    ...(ts.isFunctionLike(scope) ? scope.parameters : []),
    ...(loop ? scope.initializer.declarations : []),
    ...(ts.isCatchClause(scope) && scope.variableDeclaration
      ? [scope.variableDeclaration]
      : []),
  ];
  return declarations.some((declaration) =>
    bindingNames(declaration.name, ts).includes(name),
  );
}

/** The string the `const` that `identifier` refers to holds, when the nearest declaration of its name is one. */
function constantFor(identifier, ts) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    if (shadows(scope, identifier.text, ts)) return undefined;
    if (
      ts.isBlock(scope) ||
      ts.isSourceFile(scope) ||
      ts.isModuleBlock(scope)
    ) {
      const declared = declaredIn(scope.statements, identifier.text, ts);
      if (declared) return declared.text;
    }
  }
  return undefined;
}

/** A string literal, or a `const` of the same file in scope holding one. */
function stringOf(node, ts) {
  if (!node) return undefined;
  const value = unwrap(node, ts);
  return ts.isIdentifier(value)
    ? constantFor(value, ts)
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
    return { kind: callee, node: argument, unprefixed: unprefixed(node, ts) };
  if (ts.isShorthandPropertyAssignment(node))
    return nameOf(node.name, ts) === "componentName"
      ? { kind: "componentName", node: node.name }
      : undefined;
  if (!ts.isPropertyAssignment(node)) return undefined;
  const property = nameOf(node.name, ts);
  if (property === "componentName")
    return { kind: "componentName", node: node.initializer };
  return property === "component" && isBanner(node.parent, ts)
    ? { kind: "builder", node: node.initializer }
    : undefined;
}

/** Whether a `registerComponent` call passes `{ prefix: false }`. */
function unprefixed(call, ts) {
  const options = call.arguments?.[2];
  return Boolean(
    options &&
      ts.isObjectLiteralExpression(options) &&
      options.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          nameOf(property.name, ts) === "prefix" &&
          property.initializer.kind === ts.SyntaxKind.FalseKeyword,
      ),
  );
}

/** The component names a script names by string, with the offset of each. */
function scriptStrings(tree, ts) {
  const found = [];
  const visit = (node) => {
    const named = namedString(node, ts);
    const name = named && stringOf(named.node, ts);
    if (name)
      found.push({
        kind: named.kind,
        name,
        unprefixed: named.unprefixed,
        offset: named.node.getStart(tree),
      });
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
        bindingNames(declaration.name, ts),
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

/**
 * The `componentPrefix` of the layer's `dms.frontend.ts`: the first one
 * written as a string, or as a `const` of that file holding one.
 */
function layerPrefix(layer, ts) {
  const entry = join(layer, "dms.frontend.ts");
  if (!existsSync(entry)) return "";
  const tree = parseScript(entry, readFileSync(entry, "utf8"), ts);
  const declared = [];
  const visit = (node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      nameOf(node.name, ts) === "componentPrefix"
    )
      declared.push(stringOf(node.initializer ?? node.name, ts));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const prefix = declared.find((value) => value !== undefined);
  if (declared.length && prefix === undefined)
    throw new Error(
      `${entry}: write componentPrefix as a string, or a const of that file holding one, so that the DMS component check reads it`,
    );
  return prefix ?? "";
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
  const registered = (kind) => layerStrings.filter((use) => use.kind === kind);
  const tags = new Set([
    ...dms.components,
    ...(await rendererComponentNames(tools.rendererGlobals)),
    ...own.components.map((name) => prefix + name),
    ...registered("registerComponent").map((use) =>
      use.unprefixed || !prefix ? use.name : prefix + vueName(use.name),
    ),
  ]);
  return {
    tags,
    components: new Set([...tags].map(componentKey)),
    layouts: new Set(
      [
        ...dms.layouts,
        ...own.layouts,
        ...registered("registerLayout").map(({ name }) => name),
      ].map(layoutKey),
    ),
  };
}

function isKnown({ kind, name }, known) {
  if (kind === "vue")
    return known.tags.has(name) || known.tags.has(vueName(name));
  return (
    known.components.has(componentKey(name)) ||
    (kind === "componentName" && known.layouts.has(layoutKey(name)))
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
export async function checkDmsComponents(options) {
  return (await inspect(options)).diagnostics;
}

async function inspect({ layer, sources = [] }) {
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
  const diagnostics = [...layerStrings, ...sourceStrings]
    .filter(({ kind }) => ["vue", "builder", "componentName"].includes(kind))
    .filter((use) => DMS_NAME.test(use.name) && !isKnown(use, known))
    .map(
      ({ file, line, name }) =>
        `${relative(process.cwd(), file)}:${line}: \`${name}\` is no component the installed @antelopejs/dms, @antelopejs/dms-frontend or this layer registers`,
    );
  return { diagnostics, root, rendererMissing: !tools.rendererGlobals };
}

/**
 * Rejects with every diagnostic of {@link checkDmsComponents}, one per line.
 * When `@antelopejs/dms-frontend` is not installed, the last line says that
 * the components its renderer registers count as unknown, and how to add it.
 */
export async function assertDmsComponents(options) {
  const { diagnostics, root, rendererMissing } = await inspect(options);
  if (!diagnostics.length) return;
  const note = rendererMissing
    ? [
        `${RENDERER} is not installed in ${root}, so the components its renderer registers, such as DmsLink, count as unknown. If the layer uses one, run in ${root}: ${addCommand([RENDERER])}`,
      ]
    : [];
  throw new Error([...diagnostics, ...note].join("\n"));
}
