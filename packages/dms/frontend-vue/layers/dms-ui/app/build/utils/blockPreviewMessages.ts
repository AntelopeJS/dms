import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import {
  isPreviewTheme,
  isPreviewTree,
  type PreviewTheme,
  type PreviewTree,
} from "./blockPreview";

/**
 * The `postMessage` protocol between `/dms-preview` and the page embedding
 * it: what the parent asks the preview to draw, and what the preview reports
 * back.
 */

export const PREVIEW_CHANNEL = "dms-preview";

/** One entry of the sidebar the preview draws around the blocks. */
export interface PreviewNavigationItem {
  id: string;
  label: string;
  icon?: string;
}

/** The sidebar the preview draws around the blocks, as a dashboard does. */
export interface PreviewNavigation {
  title?: string;
  items: PreviewNavigationItem[];
  /** The id of the entry drawn as the current one. */
  active?: string;
}

/** A box in the preview's document, in CSS pixels from its top-left corner. */
export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How a text is drawn, so an input laid over it reads the same. */
export interface PreviewFont {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  color: string;
  align: string;
}

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
  /** Draws the blocks inside this sidebar; none when absent. */
  navigation?: PreviewNavigation;
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

/** Where one block of the preview sits. */
export interface PreviewBlockRect {
  /** Layout path of the block, as `select` names it. */
  path: string;
  rect: PreviewRect;
}

/**
 * Iframe → parent, while inspecting: where each block sits, after each render
 * and each change of size. The iframe is sized to its content, so the parent
 * lays its own drawing over these boxes as they are.
 */
export interface PreviewLayoutMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "layout";
  blocks: PreviewBlockRect[];
}

/** Iframe → parent, while inspecting: a text of a block was double-clicked. */
export interface PreviewTextMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "text";
  path: string;
  text: string;
  rect: PreviewRect;
  font: PreviewFont;
}

/** Iframe → parent: an entry of the sidebar was clicked. */
export interface PreviewNavigateMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "navigate";
  id: string;
}

export type PreviewOutboundMessage =
  | PreviewReadyMessage
  | PreviewResizeMessage
  | PreviewErrorMessage
  | PreviewSelectMessage
  | PreviewLayoutMessage
  | PreviewTextMessage
  | PreviewNavigateMessage;

function isRecord(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function isNavigationItem(value: unknown): value is PreviewNavigationItem {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isOptionalString(value.icon)
  );
}

/** Whether `value` is a sidebar a `render` may carry, every entry checked. */
export function isPreviewNavigation(
  value: unknown,
): value is PreviewNavigation {
  return (
    isRecord(value) &&
    isOptionalString(value.title) &&
    isOptionalString(value.active) &&
    Array.isArray(value.items) &&
    value.items.every(isNavigationItem)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value);
}

function parseRect(value: unknown): PreviewRect | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y, width, height } = value;
  return isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height)
    ? { x, y, width, height }
    : undefined;
}

function parseFont(value: unknown): PreviewFont | undefined {
  if (!isRecord(value)) return undefined;
  const { family, size, weight, lineHeight, letterSpacing, color, align } =
    value;
  return isString(family) &&
    isString(size) &&
    isString(weight) &&
    isString(lineHeight) &&
    isString(letterSpacing) &&
    isString(color) &&
    isString(align)
    ? { family, size, weight, lineHeight, letterSpacing, color, align }
    : undefined;
}

function parseBlockRect(value: unknown): PreviewBlockRect | undefined {
  if (!isRecord(value) || !isString(value.path)) return undefined;
  const rect = parseRect(value.rect);
  return rect ? { path: value.path, rect } : undefined;
}

function parseBlockRects(value: unknown): PreviewBlockRect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = value.map(parseBlockRect);
  return blocks.every((block) => block !== undefined) ? blocks : undefined;
}

function isOptionalString(value: Parameters<typeof isString>[0]): boolean {
  return value === undefined || isString(value);
}

function isOptionalBoolean(value: Parameters<typeof isBoolean>[0]): boolean {
  return value === undefined || isBoolean(value);
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
    isOptionalBoolean(data.padding) &&
    (data.navigation === undefined || isPreviewNavigation(data.navigation)),
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
    ? // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This legacy lookup rereads an unchecked getter after the string and own-key checks; its value can change, so neither check proves this index is a known protocol name.
      INBOUND_VALIDATORS[data.type as string]
    : undefined;
  if (!validate?.(data)) return undefined;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This legacy parser returns the original object unchecked. Repeated type reads can select an inherited validator such as toString, so successful dispatch does not prove the message union.
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

export function previewLayoutMessage(
  blocks: PreviewBlockRect[],
): PreviewLayoutMessage {
  return { channel: PREVIEW_CHANNEL, type: "layout", blocks };
}

export function previewTextMessage(
  text: Omit<PreviewTextMessage, "channel" | "type">,
): PreviewTextMessage {
  return { channel: PREVIEW_CHANNEL, type: "text", ...text };
}

export function previewNavigateMessage(id: string): PreviewNavigateMessage {
  return { channel: PREVIEW_CHANNEL, type: "navigate", id };
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
  layout: ({ blocks }) => {
    const parsed = parseBlockRects(blocks);
    return parsed ? previewLayoutMessage(parsed) : undefined;
  },
  text: ({ path, text, rect, font }) => {
    const box = parseRect(rect);
    const style = parseFont(font);
    return isString(path) && isString(text) && box && style
      ? previewTextMessage({ path, text, rect: box, font: style })
      : undefined;
  },
  navigate: ({ id }) => (isString(id) ? previewNavigateMessage(id) : undefined),
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
