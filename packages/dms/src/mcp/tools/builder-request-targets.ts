import { ListResources } from "@antelopejs/interface-dms-builder";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import { type JsonObject, JsonObjectSchema } from "../json";
import { jsonResult, type McpToolResult } from "../tool";

/**
 * What a URL option may lead to: a request sent with the owner's session must
 * stay in the page's data API, and a link the owner follows must not run a
 * script.
 */
type UrlKind = "request" | "link";

/** An option key holding a URL, and when the options around it make it one. */
interface UrlRule {
  key: string;
  kind: UrlKind;
  /** The keys of the same options that decide the URL and what it does. */
  reads: readonly string[];
  applies: (options: JsonObject) => boolean;
}

const REQUEST_TARGET_TYPES = new Set<JsonValue>(["api", "exportJob"]);
const LINK_TARGET_TYPES = new Set<JsonValue>(["page", "external"]);

/**
 * The URL options a block's options can hold: a form's submit, a secret
 * field's rotation, a data block's load sent with a method other than GET and
 * an action target calling an API are requests; a link and an action target
 * opening a page are links.
 */
const URL_RULES: readonly UrlRule[] = [
  {
    key: "submitUrl",
    kind: "request",
    reads: ["submitUrl"],
    applies: () => true,
  },
  {
    key: "rotateUrl",
    kind: "request",
    reads: ["rotateUrl"],
    applies: () => true,
  },
  {
    key: "fetchUrl",
    kind: "request",
    reads: ["fetchUrl", "fetchUrlMethod"],
    applies: (options) =>
      Object.hasOwn(options, "fetchUrlMethod") &&
      options.fetchUrlMethod !== HttpMethod.get,
  },
  {
    key: "url",
    kind: "request",
    reads: ["url", "type"],
    applies: (options) => REQUEST_TARGET_TYPES.has(options.type),
  },
  {
    key: "url",
    kind: "link",
    reads: ["url", "type"],
    applies: (options) => LINK_TARGET_TYPES.has(options.type),
  },
  { key: "to", kind: "link", reads: ["to"], applies: () => true },
];

/** A URL option found in a block's options. */
interface UrlTarget {
  pointer: string;
  url: JsonValue;
  rule: UrlRule;
  /** The keys from the walked options down to the options holding the URL. */
  owner: readonly string[];
}

/** The endpoints a resource's DataAPI serves below its route that a write can start at. */
const DATA_API_ENDPOINTS = [
  "get",
  "list",
  "select",
  "count",
  "count/batch",
  "summary",
  "new",
  "edit",
  "delete",
  "archive",
  "restore",
  "export/start",
];

const PATH_SEGMENT = /^[\w-]+$/;
const URL_SCHEME = /^([a-z][\d+.a-z-]*):/i;
const LINK_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const BROWSER_STRIPPED = /[\t\n\r]/g;
const LAST_STRIPPED_CODE = 0x20;

/** A request URL's path, before its query string, when it holds plain segments only. */
const PlainPathSchema = z
  .string()
  .transform((url) => url.split(/[?#]/, 1)[0] ?? "")
  .refine((path) => {
    const [root, ...segments] = path.split("/");
    return root === "" && segments.every((s) => PATH_SEGMENT.test(s));
  });

/** A link's text as the browser reads its scheme: tabs and newlines dropped, leading controls and spaces trimmed. */
const LinkSchema = z.string().transform((url) => {
  const kept = url.replaceAll(BROWSER_STRIPPED, "");
  let start = 0;
  while (start < kept.length && kept.charCodeAt(start) <= LAST_STRIPPED_CODE) {
    start += 1;
  }
  return kept.slice(start);
});

function isOptions(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerTo(pointer: string, key: string): string {
  return `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function urlTargets(
  value: JsonValue,
  pointer: string,
  owner: readonly string[] = [],
): UrlTarget[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      urlTargets(item, `${pointer}/${index}`, [...owner, String(index)]),
    );
  }
  if (!isOptions(value)) return [];
  const own = URL_RULES.filter(
    (rule) => Object.hasOwn(value, rule.key) && rule.applies(value),
  ).map((rule) => ({
    pointer: pointerTo(pointer, rule.key),
    url: value[rule.key],
    rule,
    owner,
  }));
  const nested = Object.entries(value).flatMap(([key, member]) =>
    urlTargets(member, pointerTo(pointer, key), [...owner, key]),
  );
  return [...own, ...nested];
}

/**
 * Whether a link leaves the page without running a script: a written-out
 * `http`, `https`, `mailto` or `tel` scheme, whatever tokens follow it, or no
 * scheme and no `{{token}}` before the first `/`, `?` or `#`, where a filled
 * token could spell one. A link that is not text, such as a route object,
 * names no scheme.
 */
function isSafeLink(url: JsonValue): boolean {
  const parsed = LinkSchema.safeParse(url);
  if (!parsed.success) return true;
  const scheme = URL_SCHEME.exec(parsed.data)?.[1]?.toLowerCase();
  if (scheme !== undefined) return LINK_SCHEMES.has(scheme);
  const [head = ""] = parsed.data.split(/[/?#]/, 1);
  return !head.includes("{{");
}

/** The DataAPI endpoints of the project's resources: the data API a built block may send writes to. */
async function dataApiRoutes(): Promise<Set<string>> {
  const resources = await ListResources();
  return new Set(
    resources.flatMap(({ route }) =>
      DATA_API_ENDPOINTS.map((endpoint) => `${route}/${endpoint}`),
    ),
  );
}

const REQUEST_REFUSED =
  "is outside this page's data API: a block the builder writes sends requests only to a resource's DataAPI endpoint (/api/<resource>/new, /edit…), with plain path segments and record ids in the query string. A request to any other route is the owner's to add.";

const LINK_REFUSED =
  "names a scheme a link may not use: a link the builder writes is a dashboard path or an http, https, mailto or tel URL, with no {{token}} before its first /, ? or #.";

function refusal(
  targets: readonly UrlTarget[],
  routes: ReadonlySet<string>,
): McpToolResult | undefined {
  const issues = targets
    .filter(({ rule, url }) =>
      rule.kind === "link"
        ? !isSafeLink(url)
        : !routes.has(PlainPathSchema.safeParse(url).data ?? ""),
    )
    .map(({ pointer, url, rule }) => ({
      pointer,
      message: `${JSON.stringify(url)} ${rule.kind === "link" ? LINK_REFUSED : REQUEST_REFUSED}`,
    }));
  return issues.length === 0
    ? undefined
    : jsonResult(
        { ok: false, error: { code: "invalid_config", issues } },
        true,
      );
}

/**
 * The refusal of a builder call whose block options send a request outside
 * the page's own data API, or hold a link that would run a script, or
 * `undefined` when every URL is allowed.
 *
 * A block an agent builds runs in the owner's browser with the owner's
 * session, so one posting to an owner-only route (`/api/builder/database/*`,
 * the assistant's settings) would act for the owner.
 *
 * @param input The options as the call carries them, walked whole
 * @param pointer Where `input` sits in the call's arguments
 */
export async function foreignRequestRefusal(
  input: JsonValue,
  pointer: string,
): Promise<McpToolResult | undefined> {
  const targets = urlTargets(input, pointer);
  if (targets.length === 0) return undefined;
  const routes = targets.some(({ rule }) => rule.kind === "request")
    ? await dataApiRoutes()
    : new Set<string>();
  return refusal(targets, routes);
}

const UNREADABLE_BLOCK =
  "the block's URL options cannot all be read, because the block is not one the builder edits or an option is written in code, so the URLs this patch writes or turns into requests cannot be judged: edit that block in Code mode, with the owner.";

function unreadableBlock(): McpToolResult {
  return jsonResult(
    {
      ok: false,
      error: {
        code: "invalid_config",
        issues: [{ pointer: "/path", message: UNREADABLE_BLOCK }],
      },
    },
    true,
  );
}

/** Whether a patch writes a key some URL rule reads, at its top level or anywhere under it. */
function touchesUrls(patch: JsonObject): boolean {
  return (
    URL_RULES.some(({ reads }) =>
      reads.some((key) => Object.hasOwn(patch, key)),
    ) || urlTargets(patch, "").length > 0
  );
}

/**
 * Whether a rule the patch touches also reads an option written in code,
 * which the patch keeps and the builder cannot judge.
 */
function readsCodeOption(
  patch: JsonObject,
  locked: readonly string[],
): boolean {
  const kept = locked.filter((key) => !Object.hasOwn(patch, key));
  return URL_RULES.some(
    ({ reads }) =>
      reads.some((key) => Object.hasOwn(patch, key)) &&
      reads.some((key) => kept.includes(key)),
  );
}

/** A patched URL target: one whose options the patch writes, at the top level or under a key it replaces whole. */
function patchedBy(patch: JsonObject): (target: UrlTarget) => boolean {
  return ({ owner, rule }) => {
    const [top] = owner;
    return top === undefined
      ? rule.reads.some((key) => Object.hasOwn(patch, key))
      : Object.hasOwn(patch, top);
  };
}

/**
 * What `builder_configure_block` may write: a refusal, or the page version the
 * patch was judged at, which the write must still find, so that two patches
 * judged against the same page cannot each pass and together turn a load
 * into a write.
 */
export type PatchJudgement =
  | { ok: false; refusal: McpToolResult }
  | { ok: true; expectedVersion: string | undefined };

/**
 * {@link foreignRequestRefusal} for `builder_configure_block`, judged on the
 * options the engine would merge the patch into, found by the engine's own
 * resolution of `path`, since a patch merges key by key: a patch of
 * `fetchUrlMethod` alone turns the block's `fetchUrl` into a write. Only the
 * URLs the patch writes or turns into a request are judged, so a block whose
 * author pointed it elsewhere can still be edited.
 *
 * @param path The block's path
 * @param patch The options the call writes
 * @param replace Whether the patch replaces the options instead of merging
 */
export async function judgePatch(
  path: string,
  patch: JsonObject,
  replace: boolean | undefined,
): Promise<PatchJudgement> {
  if (!touchesUrls(patch)) return { ok: true, expectedVersion: undefined };
  const { configureTargetOptions } =
    await import("../../implementations/dms-builder/engine");
  const target = configureTargetOptions(path);
  if (target === undefined) return { ok: false, refusal: unreadableBlock() };
  const current = JsonObjectSchema.safeParse(
    JSON.parse(JSON.stringify(target.config)),
  );
  if (
    !current.success ||
    (replace !== true && readsCodeOption(patch, target.locked))
  ) {
    return { ok: false, refusal: unreadableBlock() };
  }
  const merged = replace === true ? patch : { ...current.data, ...patch };
  const targets = urlTargets(merged, "/patch").filter(patchedBy(patch));
  const refused =
    targets.length === 0 ? undefined : refusal(targets, await dataApiRoutes());
  return refused === undefined
    ? { ok: true, expectedVersion: target.version }
    : { ok: false, refusal: refused };
}
