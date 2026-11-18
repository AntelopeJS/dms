import { stampedIdIssues } from "./anchor";
import { type Catalog, descriptorOf, readCatalog } from "./block-catalog";
import { CONTROLLER_BLOCKS } from "./controller-blocks";
import { readOnlyConnectionIssues } from "./data-access";
import type { AncestorFixtures, FixtureScope } from "./fixtures";
import { rewriteObject } from "./fixtures";
import {
  checkFixtureAnswer,
  type FixtureAnswers,
  fixtureAnswers,
  sampleAnswer,
} from "./fixture-answers";
import { withFieldInputs } from "./form-fields";
import { formPageModeIssues } from "./form-page-modes";
import { materializeFixtures } from "./generate";
import type {
  Json,
  JsonObject,
  MockupCategory,
  MockupIssue,
  MockupName,
  MockupNode,
  MockupPageState,
  MockupSpec,
  MockupSpecPage,
  MockupState,
} from "./model";
import { CUSTOM_PAGE_FIELDS, specSchema, zodIssues } from "./model";
import { type LinkedPage, sketchLinks } from "./page-links";
import { confineToFixtures } from "./sample-routes";
import { compileSidebar } from "./sidebar";
import { compileSketch, compileSketchPage, SKETCH_TYPE } from "./sketch";
import { tableCaptionIssues } from "./table-title";
import {
  componentOptionsOf,
  validateBlockChildren,
  validateBlockOptions,
} from "./validate";

/** The page a node is compiled on. */
interface PageScope extends FixtureScope {
  catalog: Catalog;
  paths: Record<string, string>;
  answers: FixtureAnswers;
}

type NodeCompiler = (pointer: string, layoutPath: string) => MockupNode;

/**
 * One kind of node: `resolve` answers how to compile `node` when it is of
 * this kind. {@link NODE_KINDS} tries each kind in order.
 */
interface NodeKind {
  resolve(node: MockupNode, scope: PageScope): NodeCompiler | undefined;
}

function compileChildren(
  node: MockupNode,
  pointer: string,
  layoutPath: string,
  scope: PageScope,
): MockupNode {
  if (!node.children) return node;
  const children = node.children.map((child, index) => {
    const childPointer = `${pointer}/children/${index}`;
    const childPath = `${layoutPath}.${child.id ?? index}`;
    if (Object.hasOwn(scope.paths, childPath)) {
      scope.issues.push({
        path: child.id === undefined ? childPointer : `${childPointer}/id`,
        message: `another child of this block already has the id "${child.id ?? index}"`,
      });
    }
    return compileNode(child, childPointer, childPath, scope);
  });
  return { ...node, children };
}

function withOptions(
  node: MockupNode,
  pointer: string,
  scope: PageScope,
): MockupNode & { options: JsonObject } {
  return {
    ...node,
    options: rewriteObject(node.options ?? {}, `${pointer}/options`, scope),
  };
}

const sketchKind: NodeKind = {
  resolve: (node, scope) =>
    node.type === SKETCH_TYPE
      ? (pointer) =>
          compileSketch(node, pointer, scope.issues, sketchLinks(scope))
      : undefined,
};

const controllerKind: NodeKind = {
  resolve(node, scope) {
    const descriptor = descriptorOf(node, scope.catalog);
    if (!descriptor?.controllerArg) return undefined;
    const block = CONTROLLER_BLOCKS.get(descriptor.type);
    return (pointer, layoutPath) => {
      if (block) {
        const built = block.compile(node, pointer, scope);
        return compileChildren(built, pointer, layoutPath, scope);
      }
      scope.issues.push({
        path: pointer,
        message: `${descriptor.type} needs a controller class, which a mockup cannot build: draw it with a sketch`,
      });
      return compileChildren(
        withOptions(node, pointer, scope),
        pointer,
        layoutPath,
        scope,
      );
    };
  },
};

const blockKind: NodeKind = {
  resolve(node, scope) {
    const descriptor = descriptorOf(node, scope.catalog);
    if (!descriptor) return undefined;
    return (pointer, layoutPath) => {
      const compiled = withOptions(node, pointer, scope);
      validateBlockOptions(
        descriptor,
        node,
        compiled.options,
        `${pointer}/options`,
        scope.issues,
      );
      validateBlockChildren(
        descriptor,
        node,
        pointer,
        scope.issues,
        (child) => descriptorOf(child, scope.catalog)?.type ?? child.type,
      );
      const options = withFieldInputs(
        descriptor,
        compiled.options,
        `${pointer}/options`,
        scope.issues,
      );
      return compileChildren(
        { ...compiled, options: componentOptionsOf(descriptor, options) },
        pointer,
        layoutPath,
        scope,
      );
    };
  },
};

function unknownIssue(node: MockupNode, pointer: string): MockupIssue {
  if (node.type !== undefined) {
    return {
      path: `${pointer}/type`,
      message: `no block type is registered as "${node.type}"`,
    };
  }
  if (node.componentName !== undefined) {
    return {
      path: `${pointer}/componentName`,
      message: `no registered block emits the component "${node.componentName}"`,
    };
  }
  return { path: pointer, message: "a node needs a type or a componentName" };
}

/** Emitted as written: the preview draws its `unknown_block` notice. */
const unknownKind: NodeKind = {
  resolve: (node, scope) => (pointer, layoutPath) => {
    scope.issues.push(unknownIssue(node, pointer));
    return compileChildren(
      withOptions(node, pointer, scope),
      pointer,
      layoutPath,
      scope,
    );
  },
};

const NODE_KINDS: readonly NodeKind[] = [
  sketchKind,
  controllerKind,
  blockKind,
  unknownKind,
];

/**
 * A compiled node as its tree draws it: on the fixtures alone, its options
 * reach no live route; with Real data, as compiled.
 */
function drawnOn(node: MockupNode, scope: PageScope): MockupNode {
  if (scope.routes || !node.options) return node;
  return { ...node, options: confineToFixtures(node.options, scope) };
}

function compileNode(
  node: MockupNode,
  pointer: string,
  layoutPath: string,
  scope: PageScope,
): MockupNode {
  scope.paths[layoutPath] = pointer;
  const descriptor = descriptorOf(node, scope.catalog);
  if (descriptor) checkFixtureAnswer(descriptor, node, pointer, scope);
  for (const kind of NODE_KINDS) {
    const compile = kind.resolve(node, scope);
    if (compile) return drawnOn(compile(pointer, layoutPath), scope);
  }
  return node;
}

const ROOT_LAYOUT_PREFIX = "block-";

/**
 * How deep a spec's JSON may nest, objects and arrays counted alike: a node
 * nests two levels under its parent, so a tree of about forty levels fits,
 * and the compiler's recursion stays far from the stack's limit.
 */
export const MAX_JSON_DEPTH = 100;

const OPENERS = new Set(["{", "["]);
const CLOSERS = new Set(["}", "]"]);

/** How deep the valid JSON `text` nests: its brackets outside strings, counted in one pass. */
function jsonDepth(text: string): number {
  let depth = 0;
  let deepest = 0;
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (OPENERS.has(char)) deepest = Math.max(deepest, ++depth);
    else if (CLOSERS.has(char)) depth -= 1;
  }
  return deepest;
}

function compileTree(
  page: MockupSpecPage,
  pointer: string,
  scope: PageScope,
): MockupNode[] {
  return page.tree.map((node, index) =>
    compileNode(
      node,
      `${pointer}/tree/${index}`,
      `${ROOT_LAYOUT_PREFIX}${index}`,
      scope,
    ),
  );
}

/** A custom page's tree: the one sketch its fields draw, which no spec node holds, so it has no layout path. */
function compileCustomPage(
  page: MockupSpecPage,
  pointer: string,
  scope: PageScope,
): MockupNode[] {
  const fields: JsonObject = {};
  for (const field of CUSTOM_PAGE_FIELDS) {
    const value = page[field];
    if (value !== undefined) fields[field] = value;
  }
  return [compileSketchPage(fields, pointer, scope.issues, sketchLinks(scope))];
}

/** The spec's pages as links and sub-pages see them: each one's parent and route parameter. */
type PageGraph = ReadonlyMap<string, LinkedPage>;

function pageGraph(pages: readonly MockupSpecPage[]): PageGraph {
  return new Map(
    pages.map((page) => [
      page.id,
      {
        ...(page.parent !== undefined && { parent: page.parent }),
        ...(page.route !== undefined && { param: page.route.slice(1) }),
      },
    ]),
  );
}

/** The pages above `id`, nearest first, each once: a loop of parents, which the spec reports, ends the walk. */
function ancestorsOf(id: string, graph: PageGraph): string[] {
  const found: string[] = [];
  for (let at = graph.get(id)?.parent; at !== undefined;) {
    if (at === id || found.includes(at) || !graph.has(at)) break;
    found.push(at);
    at = graph.get(at)?.parent;
  }
  return found;
}

/** What a page is compiled against: its mockup, the spec's pages and the fixtures of each. */
interface SpecScope extends Pick<PageScope, "catalog" | "issues" | "answers"> {
  name: MockupName;
  graph: PageGraph;
  fixtures: ReadonlyMap<string, JsonObject>;
  /** The generated form pages the compiled pages' tables open, filled as each page compiles. */
  generated: MockupPageState[];
}

/** The scope of `page`'s nodes: its fixtures, its ancestors' and its links. */
function scopeOf(
  page: MockupSpecPage,
  spec: SpecScope,
  issues: PageScope["issues"],
): PageScope {
  const ancestors: AncestorFixtures[] = ancestorsOf(page.id, spec.graph).map(
    (id) => ({ id, fixtures: spec.fixtures.get(id) ?? {} }),
  );
  const param = spec.graph.get(page.id)?.param;
  return {
    catalog: spec.catalog,
    issues,
    name: spec.name,
    pageId: page.id,
    fixtures: spec.fixtures.get(page.id) ?? {},
    pages: spec.graph,
    links: new Set(),
    generatedPages: [],
    ancestors,
    answers: spec.answers,
    ...(param !== undefined && { route: { param } }),
    paths: {},
  };
}

/**
 * The page's tree on its fixtures, and on its live routes when it has some.
 * The issues are the fixture side's alone: both sides share every node.
 */
function compilePage(
  page: MockupSpecPage,
  pointer: string,
  spec: SpecScope,
): MockupPageState {
  const pageScope = scopeOf(page, spec, spec.issues);
  const isCustom = page.custom === true;
  const tree = isCustom
    ? compileCustomPage(page, pointer, pageScope)
    : compileTree(page, pointer, pageScope);
  const state: MockupPageState = {
    id: page.id,
    title: page.title,
    options: page.options ?? {},
    links: [...spec.graph.keys()].filter((id) => pageScope.links.has(id)),
    tree,
    paths: pageScope.paths,
  };
  spec.generated.push(
    ...pageScope.generatedPages.map((generated): MockupPageState => ({
      id: generated.id,
      title: generated.title,
      description: generated.description,
      options: page.options ?? {},
      links: [],
      tree: generated.tree,
      paths: {},
      menu: false,
      generated: true,
      parent: page.id,
      ...(generated.route && { route: generated.route }),
    })),
  );
  if (page.liveRoutes && !isCustom) {
    state.realTree = compileTree(page, pointer, {
      ...scopeOf(page, spec, []),
      routes: page.liveRoutes,
    });
  }
  if (pageScope.route) state.route = pageScope.route;
  if (page.menu === false) state.menu = false;
  if (isCustom) state.custom = true;
  if (page.parent !== undefined) state.parent = page.parent;
  if (page.category !== undefined) state.category = page.category;
  if (page.icon !== undefined) state.icon = page.icon;
  if (page.description !== undefined) state.description = page.description;
  if (page.headerActions) state.headerActions = page.headerActions;
  if (page.livePage) state.livePage = { ref: page.livePage.ref };
  return state;
}

export type BlockTypeKind = "unknown" | "block" | "controller";

const STYLE_GROUPS: ReadonlySet<string | undefined> = new Set([
  "appearance",
  "layout",
]);

/**
 * The compiler, asked about one node at a time: the converter's only source
 * of what a mockup can express.
 */
export interface NodeOracle {
  kindOf(type: string): BlockTypeKind;
  /**
   * Whether option `key` of block type `type` is one a block draws the same
   * without it: its schema files it under a style group. An option the type
   * does not declare, or files under no group, is not.
   */
  isStyleOption(type: string, key: string): boolean;
  /**
   * The issues of `node` as the first node of a page holding `fixtures`,
   * each at a pointer relative to the node.
   */
  issuesOf(node: MockupNode, fixtures: JsonObject): MockupIssue[];
  /** A plausible answer of what block type `type` reads from its `fetchUrl`, null when none is known. */
  sampleOf(type: string): Json;
}

export function openOracle(name: MockupName, pageId: string): NodeOracle {
  const catalog = readCatalog();
  return {
    kindOf(type) {
      const descriptor = catalog.byType.get(type);
      if (!descriptor) return "unknown";
      return descriptor.controllerArg ? "controller" : "block";
    },
    isStyleOption(type, key) {
      const config = catalog.byType.get(type)?.config;
      const option =
        config && Object.hasOwn(config, key) ? config[key] : undefined;
      return STYLE_GROUPS.has(option?.ui?.group);
    },
    issuesOf(node, fixtures) {
      const scope: PageScope = {
        catalog,
        issues: [],
        name,
        pageId,
        fixtures,
        pages: new Map([[pageId, {}]]),
        links: new Set(),
        generatedPages: [],
        ancestors: [],
        answers: fixtureAnswers([], () => false),
        paths: {},
      };
      compileNode(node, "", `${ROOT_LAYOUT_PREFIX}0`, scope);
      return scope.issues;
    },
    sampleOf(type) {
      const descriptor = catalog.byType.get(type);
      return descriptor ? sampleAnswer(descriptor) : null;
    },
  };
}

/** A spec compiled for the viewer. */
export interface CompiledSpec {
  title?: string;
  categories?: MockupCategory[];
  sidebar?: MockupState["sidebar"];
  pages: MockupPageState[];
  /** Each page's fixtures, keyed by page id. */
  fixtures: Map<string, JsonObject>;
  issues: MockupIssue[];
  /** What the spec likely does not show as meant; the viewer draws it anyway. */
  warnings: MockupIssue[];
}

/**
 * Compiles a parsed spec against the block types registered now. Lenient: a
 * node whose options break its schema, or whose type is unknown, is still
 * emitted, and its issues are listed. `now` anchors the dates a `$generate`
 * fixture makes up: the last 30 days before it.
 */
export function compileSpec(
  name: MockupName,
  spec: MockupSpec,
  now: number = Date.now(),
): CompiledSpec {
  const fixtures = new Map(
    spec.pages.map((page) => [
      page.id,
      materializeFixtures(name, page.id, page.fixtures ?? {}, now),
    ]),
  );
  const catalog = readCatalog();
  const scope: SpecScope = {
    catalog,
    issues: [],
    name,
    graph: pageGraph(spec.pages),
    fixtures,
    generated: [],
    answers: fixtureAnswers(
      spec.pages,
      (node) => descriptorOf(node, catalog)?.type === "PeriodSelector",
    ),
  };
  const pages = spec.pages.map((page, index) =>
    compilePage(page, `/pages/${index}`, scope),
  );
  pages.push(...scope.generated);
  return {
    title: spec.title,
    categories: spec.categories,
    ...(spec.sidebar &&
      spec.sidebar.widgets.length > 0 && {
        sidebar: compileSidebar(spec.sidebar, scope.issues),
      }),
    pages,
    fixtures,
    issues: [
      ...scope.issues,
      ...tableCaptionIssues(spec),
      ...formPageModeIssues(spec),
      ...readOnlyConnectionIssues(spec),
      ...stampedIdIssues(spec),
    ],
    warnings: scope.answers.warnings,
  };
}

/** What reading `spec.json` gives: its spec, or why it has none. */
export type SpecRead =
  | { ok: true; spec: MockupSpec }
  | { ok: false; issues: MockupIssue[] };

/** Parses the text of `spec.json` at its boundary. */
export function parseSpec(text: string): SpecRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      issues: [{ path: "", message: `invalid JSON: ${message}` }],
    };
  }
  if (jsonDepth(text) > MAX_JSON_DEPTH) {
    return {
      ok: false,
      issues: [
        {
          path: "",
          message: `the spec nests deeper than ${MAX_JSON_DEPTH} levels`,
        },
      ],
    };
  }
  const parsed = specSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, spec: parsed.data }
    : { ok: false, issues: zodIssues("", parsed.error) };
}
