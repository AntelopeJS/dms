import {
  type BlockTypeDescriptor,
  ListBlockTypes,
} from "@antelopejs/interface-dms/base/block-types";
import { CONTROLLER_BLOCKS } from "./controller-blocks";
import type { FixtureScope } from "./fixtures";
import { rewriteObject } from "./fixtures";
import type {
  JsonObject,
  MockupIssue,
  MockupName,
  MockupNode,
  MockupPageState,
  MockupSpec,
  MockupSpecPage,
} from "./model";
import { specSchema, zodIssues } from "./model";
import { compileSketch, SKETCH_TYPE } from "./sketch";
import { validateBlockChildren, validateBlockOptions } from "./validate";

/** The registered block types, looked up as `DmsBlockPreview` does. */
interface Catalog {
  byType: Map<string, BlockTypeDescriptor>;
  byComponent: Map<string, BlockTypeDescriptor>;
}

/** Same comparison as the preview's: case, separators and `dms` prefix aside. */
function normalizeComponentName(name: string): string {
  return name
    .replace(/^dms[-_]?/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function readCatalog(): Catalog {
  const descriptors = ListBlockTypes();
  const byComponent = new Map<string, BlockTypeDescriptor>();
  for (const descriptor of descriptors) {
    const key = normalizeComponentName(descriptor.componentName);
    if (!byComponent.has(key)) byComponent.set(key, descriptor);
  }
  return {
    byType: new Map(
      descriptors.map((descriptor) => [descriptor.type, descriptor]),
    ),
    byComponent,
  };
}

/** The page a node is compiled on. */
interface PageScope extends FixtureScope {
  catalog: Catalog;
  paths: Record<string, string>;
}

type NodeCompiler = (pointer: string, layoutPath: string) => MockupNode;

/**
 * One kind of node: `resolve` answers how to compile `node` when it is of
 * this kind. {@link NODE_KINDS} tries each kind in order.
 */
interface NodeKind {
  resolve(node: MockupNode, scope: PageScope): NodeCompiler | undefined;
}

function descriptorOf(
  node: MockupNode,
  catalog: Catalog,
): BlockTypeDescriptor | undefined {
  if (node.type !== undefined) return catalog.byType.get(node.type);
  if (node.componentName === undefined) return undefined;
  return catalog.byComponent.get(normalizeComponentName(node.componentName));
}

function compileChildren(
  node: MockupNode,
  pointer: string,
  layoutPath: string,
  scope: PageScope,
): MockupNode {
  if (!node.children) return node;
  const children = node.children.map((child, index) =>
    compileNode(
      child,
      `${pointer}/children/${index}`,
      `${layoutPath}.${child.id ?? index}`,
      scope,
    ),
  );
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
      ? (pointer) => compileSketch(node, pointer, scope.issues)
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
      return compileChildren(compiled, pointer, layoutPath, scope);
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

function compileNode(
  node: MockupNode,
  pointer: string,
  layoutPath: string,
  scope: PageScope,
): MockupNode {
  scope.paths[layoutPath] = pointer;
  for (const kind of NODE_KINDS) {
    const compile = kind.resolve(node, scope);
    if (compile) return compile(pointer, layoutPath);
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

function compilePage(
  name: MockupName,
  page: MockupSpecPage,
  pointer: string,
  scope: Pick<PageScope, "catalog" | "issues">,
): MockupPageState {
  const pageScope: PageScope = {
    ...scope,
    name,
    pageId: page.id,
    fixtures: page.fixtures ?? {},
    paths: {},
  };
  const tree = page.tree.map((node, index) =>
    compileNode(
      node,
      `${pointer}/tree/${index}`,
      `${ROOT_LAYOUT_PREFIX}${index}`,
      pageScope,
    ),
  );
  return {
    id: page.id,
    title: page.title,
    options: page.options ?? {},
    tree,
    paths: pageScope.paths,
  };
}

/** A spec compiled for the viewer. */
export interface CompiledSpec {
  title?: string;
  pages: MockupPageState[];
  /** Each page's fixtures, keyed by page id. */
  fixtures: Map<string, JsonObject>;
  issues: MockupIssue[];
}

/**
 * Compiles a parsed spec against the block types registered now. Lenient: a
 * node whose options break its schema, or whose type is unknown, is still
 * emitted, and its issues are listed.
 */
export function compileSpec(name: MockupName, spec: MockupSpec): CompiledSpec {
  const scope: Pick<PageScope, "catalog" | "issues"> = {
    catalog: readCatalog(),
    issues: [],
  };
  const pages = spec.pages.map((page, index) =>
    compilePage(name, page, `/pages/${index}`, scope),
  );
  return {
    title: spec.title,
    pages,
    fixtures: new Map(spec.pages.map((page) => [page.id, page.fixtures ?? {}])),
    issues: scope.issues,
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
