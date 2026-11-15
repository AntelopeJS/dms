import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addCommand,
  dependencies,
  RENDERER,
  rendererComponentNames,
} from "./dms-components-dependencies.mjs";
import {
  layerPrefix,
  parseScript,
  scriptBindings,
  scriptStrings,
} from "./dms-components-script.mjs";

/**
 * @typedef {import("./dms-components-dependencies.mjs").DmsComponentsTools} Tools
 * @typedef {import("../../checks/dms-components.mjs").DmsComponentsOptions} DmsComponentsOptions
 * @typedef {import("./dms-components-script.mjs").UseKind} UseKind
 * @typedef {{ kind: UseKind, name: string, unprefixed?: boolean, file: string, line: number }} Use
 * @typedef {{ file: string, source: string }} SourceText
 * @typedef {{ tags: Set<string>, components: Set<string>, layouts: Set<string> }} KnownNames
 * @typedef {import("vue/compiler-sfc").SFCTemplateBlock["ast"]} TemplateRoot
 * @typedef {NonNullable<TemplateRoot> | NonNullable<TemplateRoot>["children"][number]} TemplateNode
 * @typedef {Extract<TemplateNode, { tagType: unknown }>} TemplateElement
 * @typedef {TemplateElement["props"][number]} TemplateProp
 * @typedef {Extract<TemplateProp, { value: unknown }>} TemplateAttribute
 * @typedef {TemplateAttribute & { value: NonNullable<TemplateAttribute["value"]> }} StaticAttribute
 */

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

/**
 * The second names dms.frontend.ts registers some components under.
 *
 * @type {Readonly<Record<string, string>>}
 */
const DMS_ALIASES = {
  ActivityFeed: "ActivityFeedBlock",
  SectionPanel: "SectionBlock",
  FieldRow: "FieldRowBlock",
};

/**
 * A file path as dms.frontend.ts names its component: `notice-banner.vue` is `NoticeBanner`.
 *
 * @param {string} name
 * @returns {string}
 */
function pascalCase(name) {
  return name
    .replace(/\.vue$/, "")
    .split(/[./_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

/**
 * The last name Vue's `resolveComponent` tries for a tag: `dms-card-panel` is `DmsCardPanel`.
 *
 * @param {string} name
 * @returns {string}
 */
function vueName(name) {
  const camel = name.replace(
    /-(\w)/g,
    /**
     * @param {string} _
     * @param {string} letter
     * @returns {string}
     */
    (_, letter) => letter.toUpperCase(),
  );
  return `${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

/**
 * A component name as the renderer's `resolveDmsComponent` compares it.
 *
 * @param {string} name
 * @returns {string}
 */
function componentKey(name) {
  return name
    .replace(/^lazy/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * A layout name as the renderer's `registerLayout` compares it.
 *
 * @param {string} name
 * @returns {string}
 */
function layoutKey(name) {
  return name
    .replace(/^lazy/i, "")
    .replace(/^dms[-_]?/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * @param {string} root
 * @param {(path: string) => boolean} keep
 * @returns {string[]}
 */
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
 *
 * @param {string} root
 * @param {Set<string>} [skip]
 * @returns {{ components: string[], layouts: string[] }}
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
 *
 * @returns {{ components: Set<string>, layouts: Set<string> }}
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

/**
 * @param {string} source
 * @param {number} offset
 * @returns {number}
 */
function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

/**
 * @param {TemplateNode} node
 * @returns {node is TemplateElement}
 */
function isElement(node) {
  return node.type === ELEMENT;
}

/**
 * @param {TemplateProp} prop
 * @returns {prop is StaticAttribute}
 */
function isStaticIs(prop) {
  return (
    prop.type === ATTRIBUTE &&
    "value" in prop &&
    prop.name === "is" &&
    Boolean(prop.value)
  );
}

/**
 * @param {TemplateNode} node
 * @returns {TemplateNode[]}
 */
function childrenOf(node) {
  /** @type {TemplateNode[]} */
  const children = [];
  if ("children" in node)
    for (const child of node.children)
      if (isTemplateNode(child)) children.push(child);
  return children;
}

/**
 * @param {unknown} value
 * @returns {value is TemplateNode}
 */
function isTemplateNode(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "number"
  );
}

/**
 * @param {TemplateNode} node
 * @returns {{ kind: "vue", name: string, line: number }[]}
 */
function templateUses(node) {
  const children = childrenOf(node).flatMap(templateUses);
  if (!isElement(node)) return children;
  const is = node.props.find(isStaticIs);
  const tag = node.tagType === COMPONENT_TAG ? node.tag : undefined;
  const name = node.tag === "component" ? is?.value.content : tag;
  return name
    ? [{ kind: "vue", name, line: node.loc.start.line }, ...children]
    : children;
}

/**
 * What one source file names by string or tag, with the line of each.
 *
 * @param {SourceText} sourceText
 * @param {Tools} tools
 * @returns {Use[]}
 */
function fileStrings({ file, source }, tools) {
  if (!file.endsWith(".vue"))
    return scriptStrings(parseScript(file, source, tools.ts), tools.ts).map(
      ({ offset, ...use }) => ({ ...use, file, line: lineAt(source, offset) }),
    );
  const { descriptor, errors } = tools.parse(source, { filename: file });
  if (errors.length)
    throw new Error(`Cannot parse ${file}: ${errors.join(", ")}`);
  const scripts = [descriptor.script, descriptor.scriptSetup]
    .filter((block) => block !== null)
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
 * @param {string[]} roots
 * @param {RegExp} pattern
 * @returns {SourceText[]}
 */
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

/**
 * The names Vue and the renderer resolve, from dms, the renderer and the layer.
 *
 * @param {string} root
 * @param {Use[]} layerStrings
 * @param {Tools} tools
 * @returns {Promise<KnownNames>}
 */
async function knownNames(root, layerStrings, tools) {
  const dms = dmsRegistrations();
  const prefix = layerPrefix(root, tools.ts);
  const own = registeredFiles(root);
  /** @param {UseKind} kind */
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

/**
 * @param {Pick<Use, "kind" | "name">} use
 * @param {KnownNames} known
 * @returns {boolean}
 */
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
 *
 * @param {DmsComponentsOptions} options
 * @returns {Promise<string[]>}
 */
export async function checkDmsComponents(options) {
  return (await inspect(options)).diagnostics;
}

/**
 * @param {DmsComponentsOptions} options
 * @returns {Promise<{ diagnostics: string[], root: string, rendererMissing: boolean }>}
 */
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
 *
 * @param {DmsComponentsOptions} options
 * @returns {Promise<void>}
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
