import { isDeepStrictEqual } from "node:util";
import type {
  BlockNode,
  ConfigObject,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import type { WiringReason } from "./apply-notes";
import { TABLE_SOURCE_PICKED } from "./controller-blocks";
import { fixtureKeyOf } from "./fixtures";
import type { Json, JsonObject, MockupNode } from "./model";

const ROUTE_KEY_SUFFIX = "Url";
const STATIC_OPTION = /^static[A-Z]/;
const COL_SPAN = "colSpan";
const colSpanSchema = z.number();

/** A node's options as its live block's config, or why they cannot be written. */
export type LiveOptions =
  | { ok: true; config: ConfigObject }
  | { ok: false; reason: Extract<WiringReason, "data" | "locked" | "table"> };

type Routes = Readonly<Record<string, string>>;

function isJsonObject(value: Json): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `value` as the live page holds it, or undefined when it reads data the page
 * does not serve. Only a `*Url` member reading `fixture:<key>`, with `key` one
 * of the page's live routes, goes back to its route: the conversion wrote no
 * other fixture reference.
 */
function liveValue(
  value: Json,
  key: string | undefined,
  routes: Routes,
): Json | undefined {
  const fixture = fixtureKeyOf(value);
  if (fixture !== undefined) {
    return key?.endsWith(ROUTE_KEY_SUFFIX) && Object.hasOwn(routes, fixture)
      ? routes[fixture]
      : undefined;
  }
  if (Array.isArray(value)) {
    const entries = value.map((entry) => liveValue(entry, undefined, routes));
    return entries.every((entry): entry is Json => entry !== undefined)
      ? entries
      : undefined;
  }
  return isJsonObject(value) ? liveObject(value, routes) : value;
}

function liveObject(
  object: JsonObject,
  routes: Routes,
): JsonObject | undefined {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(object)) {
    const value = liveValue(entry, key, routes);
    if (value === undefined) return undefined;
    result[key] = value;
  }
  return result;
}

/**
 * The config a live block takes for `options`, its node's options. Refused
 * when an option is one the block's source locks, when it reads a fixture
 * standing for no live route, or when it is a `static*` option the live
 * block lacks: sample data standing in for data the page must be wired to.
 */
export function liveOptionsOf(
  options: JsonObject,
  routes: Routes,
  live: JsonObject | undefined,
  locked: Readonly<Record<string, string>> | undefined,
): LiveOptions {
  for (const key of Object.keys(options)) {
    if (locked && Object.hasOwn(locked, key)) {
      return { ok: false, reason: "locked" };
    }
    if (STATIC_OPTION.test(key) && !(live && Object.hasOwn(live, key))) {
      return { ok: false, reason: "data" };
    }
  }
  const config = liveObject(options, routes);
  return config ? { ok: true, config } : { ok: false, reason: "data" };
}

/** `next` with its keys in the order `live` has them, new keys last, so a rewrite moves no line it kept. */
export function ordered(
  live: ConfigObject | undefined,
  next: ConfigObject,
): ConfigObject {
  const result: ConfigObject = {};
  for (const key of Object.keys(live ?? {})) {
    if (Object.hasOwn(next, key)) result[key] = next[key];
  }
  for (const [key, value] of Object.entries(next)) {
    if (!Object.hasOwn(result, key)) result[key] = value;
  }
  return result;
}

function splitTable(options: JsonObject): [JsonObject, JsonObject] {
  const picked: JsonObject = {};
  const rest: JsonObject = {};
  for (const [key, value] of Object.entries(options)) {
    if (Object.hasOwn(TABLE_SOURCE_PICKED, key)) picked[key] = value;
    else rest[key] = value;
  }
  return [picked, rest];
}

/**
 * The config of a bound table for its node: the live config with the options
 * a mockup draws (`TABLE_SOURCE_PICKED`) taken from the node. Refused when
 * anything its resource decides changed: its rows, its columns, its source.
 */
export function tableOptionsOf(
  node: JsonObject,
  live: JsonObject,
  block: BlockNode,
  routes: Routes,
): LiveOptions {
  const [picked, rest] = splitTable(node);
  const [livePicked, liveRest] = splitTable(live);
  if (!isDeepStrictEqual(rest, liveRest)) return { ok: false, reason: "table" };
  const mapped = liveOptionsOf(picked, routes, livePicked, block.lockedOptions);
  if (!mapped.ok) return mapped;
  const kept = Object.fromEntries(
    Object.entries(block.config ?? {}).filter(
      ([key]) => !Object.hasOwn(TABLE_SOURCE_PICKED, key),
    ),
  );
  return {
    ok: true,
    config: ordered(block.config, { ...kept, ...mapped.config }),
  };
}

/**
 * A child's live metadata with the span its node has: set, or taken out when
 * the node has none and the live span was a number the conversion read.
 */
export function metaOf(
  live: ConfigObject | undefined,
  colSpan: number | undefined,
): ConfigObject | undefined {
  const meta: ConfigObject = {};
  for (const [key, value] of Object.entries(live ?? {})) {
    if (key !== COL_SPAN || !colSpanSchema.safeParse(value).success) {
      meta[key] = value;
    }
  }
  if (colSpan !== undefined) meta[COL_SPAN] = colSpan;
  return Object.keys(meta).length > 0 ? ordered(live, meta) : undefined;
}

/** Whether `node` draws what `live` does, its own place aside: its id, slot and span. */
export function sameBlock(node: MockupNode, live: MockupNode): boolean {
  const content = ({ type, componentName, options, children }: MockupNode) => ({
    type,
    componentName,
    options,
    children,
  });
  return isDeepStrictEqual(content(node), content(live));
}

/** The place of each node among its siblings: its id, slot and span, in order. */
export function placementOf(nodes: readonly MockupNode[]): string {
  return JSON.stringify(
    nodes.map(({ id, slot, colSpan }) => ({ id, slot, colSpan })),
  );
}
