import type {
  BlockNode,
  PageStructure,
  ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import type { NodeOracle } from "./compile";
import { TABLE_SOURCE_PICKED } from "./controller-blocks";
import { fixtureKeyOf } from "./fixtures";
import { type SketchReason, sketchFor } from "./from-page-sketch";
import type { Json, JsonObject, MockupNode, MockupSpecPage } from "./model";
import {
  jsonObjectSchema,
  liveRouteSchema,
  RESERVED_MOCKUP_NAMES,
} from "./model";
import { type SampleColumn, sampleRows } from "./sample-rows";

/** How deep a converted tree nests before a block becomes a sketch: deep enough for any page, short of the spec's JSON depth limit. */
const MAX_CONVERT_DEPTH = 30;

export interface ConvertEnv {
  readonly oracle: NodeOracle;
  /** The structure of each resource a block of the page is bound to, by ref. */
  readonly resources: ReadonlyMap<string, ResourceStructure>;
}

/** A block of the live page drawn as a Custom sketch, and why. */
export type SketchNote = {
  /** The block's builder path, `<pageRef>#<name>[/<childId>...]`. */
  path: string;
  reason: SketchReason;
};

/** A live page as a mockup page, with the blocks that became sketches. */
export interface ConvertedPage {
  page: MockupSpecPage;
  sketches: SketchNote[];
}

interface Conversion {
  readonly env: ConvertEnv;
  readonly fixtures: JsonObject;
  readonly liveRoutes: Record<string, string>;
  /** The fixture key given to each `<kind> <route>`, so one route reads one fixture. */
  readonly keys: Map<string, string>;
  readonly sketches: SketchNote[];
}

/** The keys an object holds when it stands for a value written in code, not data. */
const SENTINEL_KEYS = ["$ref", "$expr", "$dataType", "$block"];
const ROUTE_KEY_SUFFIX = "Url";
const TABLE_TYPE = "TableView";
const HOME = "home";
const MAX_KEY_STEM = 52;
const MAX_NAME_STEM = 60;

const heldBlockSchema = z
  .object({
    $block: z
      .object({ type: z.string(), config: jsonObjectSchema.optional() })
      .strict(),
  })
  .strict();
const routeSchema = z.string();
const colSpanSchema = z.number();

/**
 * A block's options as JSON, read at the builder's boundary: a member the
 * builder reads as absent is left out, as it writes it.
 */
function configOf(block: BlockNode): JsonObject {
  return jsonObjectSchema.parse(JSON.parse(JSON.stringify(block.config ?? {})));
}

function objectIn(value: Json): JsonObject | undefined {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function holdsSentinel(value: Json): boolean {
  if (Array.isArray(value)) return value.some(holdsSentinel);
  const object = objectIn(value);
  if (!object) return false;
  if (SENTINEL_KEYS.some((key) => Object.hasOwn(object, key))) return true;
  return Object.values(object).some(holdsSentinel);
}

function heldBlockOf(
  parent: BlockNode,
  key: string,
  value: Json,
): BlockNode | undefined {
  const held = heldBlockSchema.safeParse(value);
  if (!held.success) return undefined;
  const { type, config } = held.data.$block;
  return {
    path: `${parent.path}/${key}`,
    name: key,
    type,
    editable: true,
    config: config ?? {},
  };
}

function slugOfText(text: string, max: number): string {
  return text
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/**
 * The fixture key that stands for `route` read as `kind`: the same for every
 * block reading it, unique on the page, and recorded with the live route and
 * its sample value.
 */
function keyFor(
  c: Conversion,
  route: string,
  sample: Json,
  kind: "fixture" | "rows",
): string {
  const id = `${kind} ${route}`;
  const known = c.keys.get(id);
  if (known !== undefined) return known;
  const prefix = kind === "rows" ? "rows-" : "";
  const stem = `${prefix}${slugOfText(route, MAX_KEY_STEM) || "data"}`;
  let key = stem;
  for (let suffix = 2; Object.hasOwn(c.liveRoutes, key); suffix += 1) {
    key = `${stem}-${suffix}`;
  }
  c.keys.set(id, key);
  c.liveRoutes[key] = route;
  c.fixtures[key] = sample;
  return key;
}

type Routed<Value> =
  | { ok: true; value: Value }
  | { ok: false; reason: SketchReason };

function routeIssue(route: string): SketchReason | undefined {
  return liveRouteSchema.safeParse(route).success ? undefined : "remote-route";
}

function routeData(value: Json, c: Conversion): Routed<Json> {
  const object = objectIn(value);
  if (object) return routeObject(object, c);
  if (!Array.isArray(value)) return { ok: true, value };
  const entries: Json[] = [];
  for (const entry of value) {
    const routed = routeData(entry, c);
    if (!routed.ok) return routed;
    entries.push(routed.value);
  }
  return { ok: true, value: entries };
}

function routeObject(value: JsonObject, c: Conversion): Routed<JsonObject> {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    const route = key.endsWith(ROUTE_KEY_SUFFIX)
      ? routeSchema.safeParse(entry)
      : undefined;
    if (route?.success) {
      const issue = routeIssue(route.data);
      if (issue) return { ok: false, reason: issue };
      result[key] = `fixture:${keyFor(c, route.data, null, "fixture")}`;
      continue;
    }
    const routed = routeData(entry, c);
    if (!routed.ok) return routed;
    result[key] = routed.value;
  }
  return { ok: true, value: result };
}

function placed(block: BlockNode, node: MockupNode): MockupNode {
  const colSpan = colSpanSchema.safeParse(block.meta?.colSpan);
  node.id = block.name;
  if (block.slot !== undefined) node.slot = block.slot;
  if (colSpan.success) node.colSpan = colSpan.data;
  return node;
}

function tableOf(block: BlockNode, c: Conversion): Routed<MockupNode> {
  const resource =
    block.type === TABLE_TYPE && block.controller !== undefined
      ? c.env.resources.get(block.controller)
      : undefined;
  if (!resource) return { ok: false, reason: "controller" };
  const config = configOf(block);
  const picked = Object.fromEntries(
    Object.entries(config).filter(([key]) =>
      Object.hasOwn(TABLE_SOURCE_PICKED, key),
    ),
  );
  if (holdsSentinel(picked)) return { ok: false, reason: "sentinel" };
  const listRoute = `${resource.route}/list`;
  const issue = routeIssue(listRoute);
  if (issue) return { ok: false, reason: issue };
  const routed = routeObject(picked, c);
  if (!routed.ok) return routed;
  const fields = listedFields(resource);
  const key = keyFor(c, listRoute, sampleRows(fields), "rows");
  const columns = Object.fromEntries(
    fields.map((field): [string, JsonObject] => [
      field.field,
      { name: field.label, type: field.type, ...field.flags },
    ]),
  );
  return {
    ok: true,
    value: {
      type: TABLE_TYPE,
      options: { ...routed.value, fetchUrl: `fixture:${key}`, columns },
    },
  };
}

/** The fields a resource's list route answers that read back whole, as table columns. */
function listedFields(
  resource: ResourceStructure,
): (SampleColumn & { flags: JsonObject })[] {
  return resource.fields.flatMap((field) => {
    if (field.opaque || field.listable === false || !field.dataType) return [];
    const flags: JsonObject = {};
    if (field.sortable !== undefined) flags.sortable = field.sortable;
    return [
      {
        field: field.name,
        label: field.label ?? field.name,
        type: field.dataType.$dataType,
        flags,
      },
    ];
  });
}

function blockOf(
  block: BlockNode,
  type: string,
  depth: number,
  c: Conversion,
): Routed<MockupNode> {
  const options: JsonObject = {};
  const held: BlockNode[] = [];
  for (const [key, value] of Object.entries(configOf(block))) {
    const child = heldBlockOf(block, key, value);
    if (child) held.push(child);
    else options[key] = value;
  }
  if (holdsSentinel(options)) return { ok: false, reason: "sentinel" };
  const routed = routeObject(options, c);
  if (!routed.ok) return routed;
  const children = [...held, ...(block.children ?? [])].map((child) =>
    convertBlock(child, depth + 1, c),
  );
  const node: MockupNode = { type };
  if (Object.keys(routed.value).length) node.options = routed.value;
  if (children.length) node.children = children;
  return { ok: true, value: node };
}

function refusalOf(node: MockupNode, c: Conversion): SketchReason | undefined {
  const issues = c.env.oracle.issuesOf(node, c.fixtures);
  if (!issues.length) return undefined;
  const onChildren = issues.every((issue) =>
    issue.path.startsWith("/children/"),
  );
  return onChildren ? "children-not-allowed" : "invalid-options";
}

function candidateOf(
  block: BlockNode,
  type: string,
  depth: number,
  c: Conversion,
): Routed<MockupNode> {
  const kind = c.env.oracle.kindOf(type);
  if (kind === "unknown") return { ok: false, reason: "unknown-type" };
  if (kind === "controller") return tableOf(block, c);
  const setInCode = Object.keys(block.lockedOptions ?? {}).some(
    (key) => !c.env.oracle.isStyleOption(type, key),
  );
  if (setInCode) return { ok: false, reason: "set-in-code" };
  return blockOf(block, type, depth, c);
}

/**
 * The spec node standing for `block`: the block itself when the compiler
 * admits it, else a Custom sketch at its place that names it and the blocks
 * under it. Total: every block gives a node.
 */
function convertBlock(
  block: BlockNode,
  depth: number,
  c: Conversion,
): MockupNode {
  const mark = c.sketches.length;
  const sketched = (reason: SketchReason): MockupNode => {
    c.sketches.splice(mark);
    c.sketches.push({ path: block.path, reason });
    const children = (block.children ?? []).map((child) => child.name);
    return placed(
      block,
      sketchFor({ name: block.name, type: block.type, children }, reason),
    );
  };
  if (block.type === null) return sketched("custom-component");
  if (!block.editable) return sketched("opaque");
  if (depth > MAX_CONVERT_DEPTH) return sketched("too-deep");
  const candidate = candidateOf(block, block.type, depth, c);
  if (!candidate.ok) return sketched(candidate.reason);
  const refusal = refusalOf(candidate.value, c);
  return refusal ? sketched(refusal) : placed(block, candidate.value);
}

function keysIn(value: Json, into: Set<string>): void {
  const key = fixtureKeyOf(value);
  if (key !== undefined) into.add(key);
  else if (Array.isArray(value)) for (const entry of value) keysIn(entry, into);
  else {
    const object = objectIn(value);
    if (object) keysIn(Object.values(object), into);
  }
}

/** The fixture keys a tree reads: a block that became a sketch reads none of its own. */
function keysInTree(
  nodes: readonly MockupNode[],
  into: Set<string>,
): Set<string> {
  for (const node of nodes) {
    keysIn(node.options ?? {}, into);
    keysInTree(node.children ?? [], into);
  }
  return into;
}

function only<Value>(
  record: Readonly<Record<string, Value>>,
  keys: ReadonlySet<string>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => keys.has(key)),
  );
}

/**
 * The mockup page of a live page: one node per top-level block, children
 * under their parent, each block the compiler refuses drawn as a sketch.
 * Every option named `*Url` reads a fixture: `null` for a block's own route,
 * sample rows for a table, never the page's real data. `liveRoutes` maps each
 * to the route it stands for, which Real data reads.
 */
export function convertPage(
  structure: PageStructure,
  pageId: string,
  env: ConvertEnv,
): ConvertedPage {
  const c: Conversion = {
    env,
    fixtures: {},
    liveRoutes: {},
    keys: new Map(),
    sketches: [],
  };
  const tree = structure.blocks.map((block) => convertBlock(block, 0, c));
  const read = keysInTree(tree, new Set());
  const page: MockupSpecPage = {
    id: pageId,
    title: structure.page.displayName,
    livePage: { ref: structure.page.ref, version: structure.version },
    ...(read.size && {
      liveRoutes: only(c.liveRoutes, read),
      fixtures: only(c.fixtures, read),
    }),
    tree,
  };
  return { page, sketches: c.sketches };
}

/** The resources the page's blocks are bound to, each once. */
export function collectControllers(blocks: readonly BlockNode[]): string[] {
  const refs = new Set<string>();
  const visit = (block: BlockNode) => {
    if (block.controller !== undefined) refs.add(block.controller);
    block.children?.forEach(visit);
  };
  blocks.forEach(visit);
  return [...refs];
}

/**
 * The mockup name of the live page `ref`: its route as a slug (`/books` gives
 * `books`, `/` gives `home`), suffixed when the mockup API reserves it.
 */
export function slugOf(ref: string): string {
  const slug = slugOfText(ref.toLowerCase(), MAX_NAME_STEM) || HOME;
  return RESERVED_MOCKUP_NAMES.includes(slug) ? `${slug}-page` : slug;
}
