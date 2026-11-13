/**
 * The block preview's contract: the tree a docs site or a chat hands
 * `DmsBlockPreview`, the `?state=` parameter carrying it, the `postMessage`
 * protocol of the embedded page, and the allowlist resolution that keeps the
 * preview to registered blocks reading relative URLs.
 */

/** A block of a preview tree, named by its registry type or component name. */
import {
  isObject,
  isString,
  isBoolean,
  isNumber,
} from "../../../../dms-core/app/utils/type-check";
export interface PreviewNode {
  /** Block registry type, e.g. `KpiCard`. Wins over `componentName`. */
  type?: string;
  /** Component a registered block type emits, e.g. `dms-kpi-card`. */
  componentName?: string;
  options?: Record<string, unknown>;
  children?: PreviewChildNode[];
}

/** A child of a container block, with what a page child carries besides. */
export interface PreviewChildNode extends PreviewNode {
  id?: string;
  slot?: string;
  colSpan?: number;
}

export type PreviewTree = PreviewNode | PreviewNode[];

export type PreviewTheme = "light" | "dark";

/** What `?state=` carries, as base64url-encoded JSON. */
export interface PreviewState {
  tree: PreviewTree;
  theme?: PreviewTheme;
  locale?: string;
  /** Pads the blocks off the frame's edges. Defaults to true. */
  padding?: boolean;
  /** Paints no background, so the embedding page shows through. */
  transparent?: boolean;
}

/** What the preview knows of one registered block type. */
export interface PreviewBlockType {
  componentName: string;
  /** Options the factory sets whatever its caller passes. */
  fixedOptions?: Record<string, unknown>;
  /** Takes a controller class: drawn only when built from a route instead. */
  needsController?: boolean;
}

export type PreviewBlockTypes = Record<string, PreviewBlockType>;

export type PreviewIssueKey =
  | "unknown_block"
  | "needs_backend"
  | "unsafe_url"
  | "unsafe_method"
  | "invalid_sketch";

/** Node type of a sketch: static HTML of a part that is not a DMS block. */
export const SKETCH_NODE_TYPE = "sketch";

export const SKETCH_DEFAULT_HEIGHT_PX = 320;
export const SKETCH_MIN_HEIGHT_PX = 80;
export const SKETCH_MAX_HEIGHT_PX = 1200;
export const SKETCH_CAPTION_MAX_LENGTH = 200;

/** The options of a sketch node, as {@link resolvePreviewTree} reads them. */
export interface PreviewSketch {
  html: string;
  css?: string;
  /** Frame height in CSS pixels, within the sketch bounds. */
  height: number;
  caption?: string;
}

/** Why a node is drawn as an inline notice instead of its block. */
export interface PreviewIssue {
  key: PreviewIssueKey;
  /** The block type, or the name that matched none. */
  name: string;
  /** The option value refused, for the `unsafe_*` issues. */
  value?: string;
}

/** A node checked against the allowlist, ready to map onto a page tree. */
export interface PreviewResolvedNode {
  id: string;
  componentName?: string;
  options: Record<string, unknown>;
  children: PreviewResolvedNode[];
  slot?: string;
  colSpan?: number;
  issue?: PreviewIssue;
  /** Set on a sketch node, which has no component. */
  sketch?: PreviewSketch;
}

export const PREVIEW_CHANNEL = "dms-preview";

export const PREVIEW_THEMES: readonly PreviewTheme[] = ["light", "dark"];

/** Parent → iframe: draw this tree. */
export interface PreviewRenderMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "render";
  tree: PreviewTree;
  theme?: PreviewTheme;
  locale?: string;
  /** Paints no background; kept from the previous state when absent. */
  transparent?: boolean;
  /** Pads the blocks off the frame's edges; kept from the previous state when absent. */
  padding?: boolean;
}

/** Parent → iframe: switch the color mode. */
export interface PreviewThemeMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "theme";
  theme: PreviewTheme;
}

/**
 * Parent → iframe: while enabled, hovering a block outlines it and a click
 * selects it instead of reaching it.
 */
export interface PreviewInspectMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "inspect";
  enabled: boolean;
}

export type PreviewInboundMessage =
  | PreviewRenderMessage
  | PreviewThemeMessage
  | PreviewInspectMessage;

/** Iframe → parent: mounted, ready for `render`. */
export interface PreviewReadyMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "ready";
}

/** Iframe → parent: the content is now this tall, in CSS pixels. */
export interface PreviewResizeMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "resize";
  height: number;
}

/** Iframe → parent: something could not be drawn. */
export interface PreviewErrorMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "error";
  message: string;
}

/** Iframe → parent: the block at this layout path was clicked while inspecting. */
export interface PreviewSelectMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "select";
  /** Layout path of the block: its root key `block-<i>`, then each child id, joined by dots. */
  path: string;
}

export type PreviewOutboundMessage =
  | PreviewReadyMessage
  | PreviewResizeMessage
  | PreviewErrorMessage
  | PreviewSelectMessage;

const ROOT_ID_PREFIX = "block-";
const RELATIVE_PATH_PATTERN = /^\/(?![/\\])/;
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const ROUTE_SOURCE_OPTION = "source";
const BASE64_PADDING_LENGTH = 4;

function isRecord(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function isOptionalString(value: Parameters<typeof isString>[0]): boolean {
  return value === undefined || isString(value);
}

function isPreviewNode(value: unknown): value is PreviewNode {
  if (!isRecord(value)) return false;
  if (!isOptionalString(value.type)) return false;
  if (!isOptionalString(value.componentName)) return false;
  if (value.options !== undefined && !isRecord(value.options)) return false;
  if (value.children === undefined) return true;
  return Array.isArray(value.children) && value.children.every(isPreviewNode);
}

/** Whether `value` is a node or a list of nodes. */
export function isPreviewTree(value: unknown): value is PreviewTree {
  return Array.isArray(value)
    ? value.every(isPreviewNode)
    : isPreviewNode(value);
}

export function isPreviewTheme(value: unknown): value is PreviewTheme {
  return PREVIEW_THEMES.some((theme) => theme === value);
}

function isOptionalBoolean(value: Parameters<typeof isBoolean>[0]): boolean {
  return value === undefined || isBoolean(value);
}

function hasValidStateExtras(value: Record<string, unknown>): boolean {
  if (value.theme !== undefined && !isPreviewTheme(value.theme)) return false;
  if (!isOptionalString(value.locale)) return false;
  return (
    isOptionalBoolean(value.padding) && isOptionalBoolean(value.transparent)
  );
}

function isPreviewState(value: unknown): value is PreviewState {
  return (
    isRecord(value) && isPreviewTree(value.tree) && hasValidStateExtras(value)
  );
}

function bytesToBinary(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function binaryToBytes(binary: string): Uint8Array {
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** The `?state=` value carrying `state`: base64url of its UTF-8 JSON. */
export function encodePreviewState(state: PreviewState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  return btoa(bytesToBinary(bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** The state a `?state=` value carries, or undefined when it is not one. */
export function decodePreviewState(param: string): PreviewState | undefined {
  try {
    const base64 = param.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(
      Math.ceil(base64.length / BASE64_PADDING_LENGTH) * BASE64_PADDING_LENGTH,
      "=",
    );
    const json = new TextDecoder().decode(binaryToBytes(atob(padded)));
    const state: unknown = JSON.parse(json);
    return isPreviewState(state) ? state : undefined;
  } catch {
    return undefined;
  }
}

const INBOUND_VALIDATORS: Record<
  Extract<Parameters<typeof Object.hasOwn>[1], string>,
  (data: Record<string, unknown>) => boolean
> = {
  render: (data) =>
    isPreviewTree(data.tree) &&
    (data.theme === undefined || isPreviewTheme(data.theme)) &&
    isOptionalString(data.locale) &&
    isOptionalBoolean(data.transparent) &&
    isOptionalBoolean(data.padding),
  theme: (data) => isPreviewTheme(data.theme),
  inspect: (data) => isBoolean(data.enabled),
};

/**
 * The preview message `data` is, or undefined for anything else posted to the
 * window (another channel, a malformed tree): the page ignores those.
 */
export function parsePreviewMessage(
  data: Parameters<typeof isRecord>[0],
): PreviewInboundMessage | undefined {
  if (!isRecord(data) || data.channel !== PREVIEW_CHANNEL) return undefined;
  const isKnownType =
    isString(data.type) && Object.hasOwn(INBOUND_VALIDATORS, data.type);
  const validate = isKnownType
    ? INBOUND_VALIDATORS[data.type as string]
    : undefined;
  if (!validate?.(data)) return undefined;
  return data as PreviewInboundMessage & typeof data;
}

export function previewReadyMessage(): PreviewReadyMessage {
  return { channel: PREVIEW_CHANNEL, type: "ready" };
}

export function previewResizeMessage(height: number): PreviewResizeMessage {
  return {
    channel: PREVIEW_CHANNEL,
    type: "resize",
    height: Math.ceil(height),
  };
}

export function previewErrorMessage(message: string): PreviewErrorMessage {
  return { channel: PREVIEW_CHANNEL, type: "error", message };
}

export function previewSelectMessage(path: string): PreviewSelectMessage {
  return { channel: PREVIEW_CHANNEL, type: "select", path };
}

/** Parent → iframe constructors, for the page that embeds the preview. */
export function previewRenderMessage(
  state: Omit<PreviewRenderMessage, "channel" | "type">,
): PreviewRenderMessage {
  return { channel: PREVIEW_CHANNEL, type: "render", ...state };
}

export function previewInspectMessage(enabled: boolean): PreviewInspectMessage {
  return { channel: PREVIEW_CHANNEL, type: "inspect", enabled };
}

const OUTBOUND_PARSERS: Record<
  Extract<Parameters<typeof Object.hasOwn>[1], string>,
  (data: Record<string, unknown>) => PreviewOutboundMessage | undefined
> = {
  ready: () => previewReadyMessage(),
  resize: ({ height }) =>
    isNumber(height) && Number.isFinite(height)
      ? { channel: PREVIEW_CHANNEL, type: "resize", height }
      : undefined,
  error: ({ message }) =>
    isString(message) ? previewErrorMessage(message) : undefined,
  select: ({ path }) =>
    isString(path) ? previewSelectMessage(path) : undefined,
};

/**
 * The message the embedded preview posted in `data`, or undefined for anything
 * else a window receives (another channel, an unknown or malformed message):
 * the embedding page ignores those.
 */
export function parsePreviewOutboundMessage(
  data: Parameters<typeof isRecord>[0],
): PreviewOutboundMessage | undefined {
  if (!isRecord(data) || data.channel !== PREVIEW_CHANNEL) return undefined;
  const type = data.type;
  if (!isString(type) || !Object.hasOwn(OUTBOUND_PARSERS, type))
    return undefined;
  return OUTBOUND_PARSERS[type]?.(data);
}

/**
 * A URL a block may fetch from the preview: a path of this site. Anything
 * with a scheme or a host (`https://…`, `//host/…`, `/\host`) would let an
 * embedding page make the preview call out with the visitor's cookies.
 */
export function isRelativePath(url: string): boolean {
  return RELATIVE_PATH_PATTERN.test(url);
}

/** A method a block may load with: it reads, so loading the page changes nothing. */
export function isReadMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

interface OptionRule {
  issue: PreviewIssueKey;
  /** Matches the option keys the rule applies to. */
  key: RegExp;
  isAllowed: (value: string) => boolean;
}

/**
 * What a tree an embedding page hands over may not make the preview do with
 * the visitor's session: call another site, or write on load (`fetchUrl`
 * read with `POST`). A user action (a form's submit) stays the user's.
 */
const OPTION_RULES: OptionRule[] = [
  { issue: "unsafe_url", key: /(url|^location)$/i, isAllowed: isRelativePath },
  { issue: "unsafe_method", key: /urlmethod$/i, isAllowed: isReadMethod },
];

/** An option value the preview refuses, with the rule refusing it. */
export interface RefusedOption {
  issue: PreviewIssueKey;
  value: string;
}

function refuseEntry(
  key: string,
  entry: Parameters<typeof isString>[0],
): RefusedOption | undefined {
  if (!isString(entry) || entry === "") return undefined;
  const rule = OPTION_RULES.find(
    (candidate) => candidate.key.test(key) && !candidate.isAllowed(entry),
  );
  return rule ? { issue: rule.issue, value: entry } : undefined;
}

/** The first option, at any depth, an {@link OPTION_RULES} rule refuses. */
export function findRefusedOption(
  value: Parameters<typeof isRecord>[0],
): RefusedOption | undefined {
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((entry) => ["", entry])
    : isRecord(value)
      ? Object.entries(value)
      : [];
  for (const [key, entry] of entries) {
    const refused = refuseEntry(key, entry) ?? findRefusedOption(entry);
    if (refused) return refused;
  }
  return undefined;
}

/** Same comparison as the engine's: case, separators and `dms` prefix aside. */
function normalizeComponentName(name: string): string {
  return name
    .replace(/^dms[-_]?/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

interface MatchedBlockType {
  name: string;
  blockType: PreviewBlockType;
}

function matchBlockType(
  node: PreviewNode,
  blockTypes: PreviewBlockTypes,
): MatchedBlockType | undefined {
  if (node.type) {
    const blockType = Object.hasOwn(blockTypes, node.type)
      ? blockTypes[node.type]
      : undefined;
    return blockType ? { name: node.type, blockType } : undefined;
  }
  if (!node.componentName) return undefined;
  const wanted = normalizeComponentName(node.componentName);
  const match = Object.entries(blockTypes).find(
    ([, blockType]) =>
      normalizeComponentName(blockType.componentName) === wanted,
  );
  return match ? { name: match[0], blockType: match[1] } : undefined;
}

/**
 * Whether a block that takes a controller was built from a route instead
 * (`TableView.fromSource`): it reads `source.fetchUrl`, which a preview can
 * call like any other block's URL.
 */
function readsRouteSource(options: Record<string, unknown>): boolean {
  const source = options[ROUTE_SOURCE_OPTION];
  return isRecord(source) && isString(source.fetchUrl);
}

/**
 * Whether a resource form was serialized with its fields and the URL of the
 * record it reads, and saves nowhere: drawn like a `Form`, its `fetchUrl`
 * checked by {@link OPTION_RULES} like any other block's URL.
 */
function readsSerializedForm(
  blockType: PreviewBlockType,
  options: Record<string, unknown>,
): boolean {
  return (
    blockType.componentName === "dms-form" &&
    isString(options.fetchUrl) &&
    Array.isArray(options.fields) &&
    !options.submitUrl
  );
}

function issueFor(
  node: PreviewNode,
  match: MatchedBlockType | undefined,
  options: Record<string, unknown>,
): PreviewIssue | undefined {
  if (!match) {
    return {
      key: "unknown_block",
      name: node.type ?? node.componentName ?? "",
    };
  }
  if (
    match.blockType.needsController &&
    !readsRouteSource(options) &&
    !readsSerializedForm(match.blockType, options)
  ) {
    return { key: "needs_backend", name: match.name };
  }
  const refused = findRefusedOption(options);
  return refused
    ? { key: refused.issue, name: match.name, value: refused.value }
    : undefined;
}

function clampSketchHeight(height: unknown): number {
  if (!isNumber(height) || !Number.isFinite(height)) {
    return SKETCH_DEFAULT_HEIGHT_PX;
  }
  return Math.min(
    SKETCH_MAX_HEIGHT_PX,
    Math.max(SKETCH_MIN_HEIGHT_PX, Math.round(height)),
  );
}

/**
 * The sketch a node's options describe, or undefined when they hold no `html`
 * string. The other options are optional: a wrong type falls back to the
 * default instead of refusing the sketch.
 */
function parseSketch(
  options: Record<string, unknown> | undefined,
): PreviewSketch | undefined {
  if (!options || !isString(options.html)) return undefined;
  const sketch: PreviewSketch = {
    html: options.html,
    height: clampSketchHeight(options.height),
  };
  if (isString(options.css)) sketch.css = options.css;
  if (isString(options.caption)) {
    sketch.caption = options.caption.slice(0, SKETCH_CAPTION_MAX_LENGTH);
  }
  return sketch;
}

function resolveSketchNode(
  node: PreviewNode,
  resolved: PreviewResolvedNode,
): PreviewResolvedNode {
  const sketch = parseSketch(node.options);
  if (sketch) resolved.sketch = sketch;
  else resolved.issue = { key: "invalid_sketch", name: SKETCH_NODE_TYPE };
  return resolved;
}

function resolveNode(
  node: PreviewChildNode,
  id: string,
  blockTypes: PreviewBlockTypes,
): PreviewResolvedNode {
  const placement: PreviewResolvedNode = { id, options: {}, children: [] };
  if (node.slot) placement.slot = node.slot;
  if (node.colSpan !== undefined) placement.colSpan = node.colSpan;
  if (node.type === SKETCH_NODE_TYPE) return resolveSketchNode(node, placement);

  const match = matchBlockType(node, blockTypes);
  const options = { ...node.options, ...match?.blockType.fixedOptions };
  const issue = issueFor(node, match, options);
  if (issue) return { ...placement, issue };
  return {
    ...placement,
    options,
    children: resolveChildren(node.children, blockTypes),
    componentName: match?.blockType.componentName,
  };
}

function resolveChildren(
  children: PreviewChildNode[] | undefined,
  blockTypes: PreviewBlockTypes,
): PreviewResolvedNode[] {
  return (children ?? []).map((child, index) =>
    resolveNode(child, child.id ?? String(index), blockTypes),
  );
}

/**
 * Checks a tree against the registered block types: each node becomes the
 * component its type emits, with the factory's fixed options merged over its
 * own, or carries the issue that keeps it from being drawn. Never resolves to
 * a component that is not a registered block.
 */
export function resolvePreviewTree(
  tree: PreviewTree,
  blockTypes: PreviewBlockTypes,
): PreviewResolvedNode[] {
  const roots = Array.isArray(tree) ? tree : [tree];
  return roots.map((root, index) =>
    resolveNode(root, `${ROOT_ID_PREFIX}${index}`, blockTypes),
  );
}

/** Every issue of a resolved tree, depth first. */
export function collectPreviewIssues(
  nodes: PreviewResolvedNode[],
): PreviewIssue[] {
  return nodes.flatMap((node) => [
    ...(node.issue ? [node.issue] : []),
    ...collectPreviewIssues(node.children),
  ]);
}
