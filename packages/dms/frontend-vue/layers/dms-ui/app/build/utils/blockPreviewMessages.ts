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

function isRecord(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
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
