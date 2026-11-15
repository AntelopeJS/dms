import { isDeepStrictEqual } from "node:util";
import type {
  BlockDraft,
  BlockNode,
  ConfigObject,
  ConfigValue,
  OpResult,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { z } from "zod";
import { listResourceSummaries } from "./resource-index";

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
  applies: (options: ConfigObject) => boolean;
}

const REQUEST_TARGET_TYPES = new Set<ConfigValue>(["api", "exportJob"]);
const LINK_TARGET_TYPES = new Set<ConfigValue>(["page", "external"]);

/** Whether `options` holds `key` as its own member with a value: an `undefined` member is an absent one. */
function holds(options: ConfigObject, key: string): boolean {
  return Object.hasOwn(options, key) && options[key] !== undefined;
}

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
      holds(options, "fetchUrlMethod") &&
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
  url: ConfigValue;
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

function isOptions(value: ConfigValue): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A value of options as plain data, the way the builder reads it back. */
const PlainValueSchema: z.ZodType<ConfigValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(PlainValueSchema),
    z.record(z.string(), PlainValueSchema),
  ]),
);

const PlainOptionsSchema = z.record(z.string(), PlainValueSchema);

/** Options as plain data: what the builder reads back, its absent options left out. */
function plainOptions(config: ConfigObject | undefined): ConfigObject {
  const parsed = PlainOptionsSchema.safeParse(
    JSON.parse(JSON.stringify(config ?? {})),
  );
  return parsed.success ? parsed.data : {};
}

function pointerTo(pointer: string, key: string): string {
  return `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function urlTargets(
  value: ConfigValue,
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
    (rule) => holds(value, rule.key) && rule.applies(value),
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
function isSafeLink(url: ConfigValue): boolean {
  const parsed = LinkSchema.safeParse(url);
  if (!parsed.success) return true;
  const scheme = URL_SCHEME.exec(parsed.data)?.[1]?.toLowerCase();
  if (scheme !== undefined) return LINK_SCHEMES.has(scheme);
  const [head = ""] = parsed.data.split(/[/?#]/, 1);
  return !head.includes("{{");
}

/** The DataAPI endpoints of the project's resources: the data API a built block may send writes to. */
function dataApiRoutes(): Set<string> {
  return new Set(
    listResourceSummaries().flatMap(({ route }) =>
      DATA_API_ENDPOINTS.map((endpoint) => `${route}/${endpoint}`),
    ),
  );
}

const REQUEST_REFUSED =
  "is outside this page's data API: a block the builder writes sends requests only to a resource's DataAPI endpoint (/api/<resource>/new, /edit…), with plain path segments and record ids in the query string. A request to any other route is the owner's to add.";

const LINK_REFUSED =
  "names a scheme a link may not use: a link the builder writes is a dashboard path or an http, https, mailto or tel URL, with no {{token}} before its first /, ? or #.";

const UNREADABLE_BLOCK =
  "the block's URL options cannot all be read, because the block is not one the builder edits or an option is written in code, so the URLs this patch writes or turns into requests cannot be judged: edit that block in Code mode, with the owner.";

function issuesOf(targets: readonly UrlTarget[]): ValidationIssue[] {
  const routes = targets.some(({ rule }) => rule.kind === "request")
    ? dataApiRoutes()
    : new Set<string>();
  return targets
    .filter(({ rule, url }) =>
      rule.kind === "link"
        ? !isSafeLink(url)
        : !routes.has(PlainPathSchema.safeParse(url).data ?? ""),
    )
    .map(({ pointer, url, rule }) => ({
      pointer,
      message: `${JSON.stringify(url)} ${rule.kind === "link" ? LINK_REFUSED : REQUEST_REFUSED}`,
    }));
}

/** The `invalid_config` refusal of `issues`, or `undefined` when there are none. */
export function requestRefusal(
  issues: ValidationIssue[],
): OpResult<never> | undefined {
  return issues.length === 0
    ? undefined
    : { ok: false, error: { code: "invalid_config", issues } };
}

/**
 * The issues of block options an agent writes whole: each URL that sends a
 * request outside the page's own data API, or a link that would run a script.
 *
 * A block an agent builds runs in the owner's browser with the owner's
 * session, so one posting to an owner-only route (`/api/builder/database/*`,
 * the assistant's settings) would act for the owner.
 *
 * @param config The options as the engine writes them
 * @param pointer Where `config` sits in the operation's input
 */
export function requestIssues(
  config: ConfigObject,
  pointer: string,
): ValidationIssue[] {
  return issuesOf(urlTargets(config, pointer));
}

/** Whether a patch writes a key some URL rule reads, at its top level or anywhere under it. */
function touchesUrls(patch: ConfigObject): boolean {
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
  patch: ConfigObject,
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
function patchedBy(patch: ConfigObject): (target: UrlTarget) => boolean {
  return ({ owner, rule }) => {
    const [top] = owner;
    return top === undefined
      ? rule.reads.some((key) => Object.hasOwn(patch, key))
      : Object.hasOwn(patch, top);
  };
}

/** The literal options a patch merges into, and the options written in code, when the builder can read them. */
export interface PatchedOptions {
  config: ConfigObject;
  locked: readonly string[];
}

/**
 * The issues of a patch an agent writes into a block's options, judged on the
 * options the patch is merged into, since a patch merges key by key: a patch
 * of `fetchUrlMethod` alone turns the block's `fetchUrl` into a write. Only
 * the URLs the patch writes or turns into a request are judged, so a block
 * whose author pointed it elsewhere can still be edited. A patch touching a
 * URL of a block whose options cannot be read is refused at `/path`.
 *
 * @param current The block's options, or `undefined` when they cannot be read
 * @param patch The options the call writes
 * @param replace Whether the patch replaces the options instead of merging
 */
export function patchRequestIssues(
  current: PatchedOptions | undefined,
  patch: ConfigObject,
  replace: boolean,
): ValidationIssue[] {
  if (!touchesUrls(patch)) return [];
  if (
    current === undefined ||
    (!replace && readsCodeOption(patch, current.locked))
  ) {
    return [{ pointer: "/path", message: UNREADABLE_BLOCK }];
  }
  const merged = replace ? patch : { ...current.config, ...patch };
  return issuesOf(urlTargets(merged, "/patch").filter(patchedBy(patch)));
}

interface DraftJudgement {
  targets: UrlTarget[];
  unreadable: string[];
}

function judgeDraftBlocks(
  blocks: readonly BlockDraft[],
  live: readonly BlockNode[],
  pointer: string,
  out: DraftJudgement,
): DraftJudgement {
  blocks.forEach((block, index) => {
    const at = `${pointer}/${index}`;
    const current = live.find(({ name }) => name === block.name);
    if (block.preserve !== true) {
      const config = plainOptions(block.config);
      const before = plainOptions(current?.config);
      const changed = Object.fromEntries(
        Object.entries(config).filter(
          ([key, value]) => !isDeepStrictEqual(value, before[key]),
        ),
      );
      if (readsCodeOption(changed, Object.keys(current?.lockedOptions ?? {}))) {
        out.unreadable.push(at);
      }
      out.targets.push(
        ...urlTargets(config, `${at}/config`).filter(patchedBy(changed)),
      );
    }
    judgeDraftBlocks(
      block.children ?? [],
      current?.children ?? [],
      `${at}/children`,
      out,
    );
  });
  return out;
}

/**
 * The request-target issues of a whole-page draft, as `mockup_apply_to_page`
 * writes one: each block it writes is judged as {@link patchRequestIssues}
 * judges a patch, on the URLs whose value differs from the live block's or
 * that its changes turn into a request, so a block kept as written passes.
 *
 * @param blocks The draft's blocks
 * @param live The live page's blocks the draft is written over
 */
export function draftRequestIssues(
  blocks: readonly BlockDraft[],
  live: readonly BlockNode[],
): ValidationIssue[] {
  const { targets, unreadable } = judgeDraftBlocks(blocks, live, "/blocks", {
    targets: [],
    unreadable: [],
  });
  return [
    ...unreadable.map((pointer) => ({ pointer, message: UNREADABLE_BLOCK })),
    ...issuesOf(targets),
  ];
}
