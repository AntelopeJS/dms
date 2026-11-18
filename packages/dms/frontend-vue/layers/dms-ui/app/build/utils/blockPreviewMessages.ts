import type { JsonValue } from "../../../../dms-core/app/types/json";
import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import { ButtonVariant } from "../../../../dms-core/app/types/button";
import { Color, type ColorValue } from "../../../../dms-core/app/types/color";
import { isObjectValue } from "./json";
import {
  isPreviewTheme,
  isPreviewTree,
  type PreviewSketch,
  type PreviewTheme,
  type PreviewTree,
} from "./blockPreview";
import type { MockupSectionEdit } from "./mockupSections";
import { parseSectionEdit } from "./mockupSectionEdits";
export type { PreviewFont, PreviewRect } from "./previewGeometry";
import {
  parseFont,
  parseRect,
  type PreviewFont,
  type PreviewRect,
} from "./previewGeometry";
import { isPageStatus, type PreviewPageStatus } from "./previewPageStatus";

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
  /** The route of the live page it was converted from, whose own entry the sidebar then leaves out. */
  livePage?: string;
  /** What the page is beside the live app, badged on its entry; set in a whole-platform mockup only. */
  status?: PreviewPageStatus;
}

/** A category of the sidebar: the header its entries are listed under. */
export interface PreviewNavigationCategory {
  id: string;
  title: string;
  icon?: string;
}

/** A section of the sidebar: a category and its entries, or the default section's entries. */
export interface PreviewNavigationSection {
  /** None for the default section, which holds the pages without a category. */
  category?: PreviewNavigationCategory;
  items: PreviewNavigationItem[];
}

/** The sidebar the preview draws around the blocks, as a dashboard does. */
export interface PreviewNavigation {
  title?: string;
  /** The default section first, then each category in the menu's order. */
  sections: PreviewNavigationSection[];
  /** The id of the entry drawn as the current one. */
  active?: string;
  /** The sidebar edits its sections, each change posted as a `section-edit`. */
  editable?: boolean;
  /** Sketches drawn below the sidebar's own widgets. */
  widgets?: PreviewSidebarWidget[];
  /**
   * The mockup stands for the whole platform: the sidebar is its own menu,
   * with none of the app's entries merged in.
   */
  wholeApp?: boolean;
}

/** A sketch the sidebar draws among its widgets, `caption` over it. */
export interface PreviewSidebarWidget extends PreviewSketch {
  id: string;
}

type ButtonVariantValue = `${ButtonVariant}`;

const HEADER_COLORS = new Set<string>(Object.values(Color));
const HEADER_VARIANTS = new Set<string>(Object.values(ButtonVariant));

/** Whether `value` is a color a header button takes. */
export function isHeaderColor(
  value: Parameters<typeof isString>[0],
): value is ColorValue {
  return isString(value) && HEADER_COLORS.has(value);
}

/** Whether `value` is a variant a header button takes. */
export function isHeaderVariant(
  value: Parameters<typeof isString>[0],
): value is ButtonVariantValue {
  return isString(value) && HEADER_VARIANTS.has(value);
}

/** A button right of the page title, as the header draws it. */
export interface PreviewHeaderAction {
  label: string;
  icon?: string;
  color?: ColorValue;
  variant?: ButtonVariantValue;
}

/** The page header the preview draws above the blocks, as the dashboard draws a page's. */
export interface PreviewHeader {
  title: string;
  icon?: string;
  description?: string;
  actions?: PreviewHeaderAction[];
  /** What the page is beside the live app, badged in the top bar; set in a whole-platform mockup only. */
  status?: PreviewPageStatus;
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
  /** Draws this page header, and the dashboard's top bar over it, above the blocks; none when absent. */
  header?: PreviewHeader;
  /** The route parameters the blocks fill `{{params.X}}` with, as a page's route gives them; none when absent. */
  params?: Record<string, string>;
  /** Draws the live page at this route, read-only, in place of the tree; none when absent. */
  live?: string;
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

/**
 * Parent → iframe: the frame is at least this tall, in CSS pixels, so a short
 * page fills the window it is drawn in: the sidebar and the background reach
 * the bottom. A longer page grows past it; 0 lifts the floor.
 */
export interface PreviewMinHeightMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "min-height";
  height: number;
}

export type PreviewInboundMessage =
  | PreviewRenderMessage
  | PreviewThemeMessage
  | PreviewInspectMessage
  | PreviewMinHeightMessage;

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

/** Iframe → parent, while inspecting: the page header was clicked, which picks the page itself. */
export interface PreviewSelectPageMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "select-page";
}

/** Iframe → parent: an entry of the sidebar, or a link to a page of the mockup, was clicked. */
export interface PreviewNavigateMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "navigate";
  id: string;
  /** The row the page shows, which a link from a row passes. */
  record?: string;
}

/** Iframe → parent: Escape was pressed in the page, and no menu or dialog of its own took it. */
export interface PreviewEscapeMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "escape";
}

/** Iframe → parent: the sidebar changed its sections, which the parent writes to the spec. */
export interface PreviewSectionEditMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "section-edit";
  edit: MockupSectionEdit;
}

/**
 * Iframe → parent: the pointer was pressed in the preview, with this button.
 * The parent's own document never sees a press in the iframe, and inspecting
 * keeps the press from moving the focus there.
 */
export interface PreviewPressMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: "press";
  button: number;
}

export type PreviewOutboundMessage =
  | PreviewReadyMessage
  | PreviewResizeMessage
  | PreviewErrorMessage
  | PreviewSelectMessage
  | PreviewLayoutMessage
  | PreviewTextMessage
  | PreviewSelectPageMessage
  | PreviewNavigateMessage
  | PreviewEscapeMessage
  | PreviewSectionEditMessage
  | PreviewPressMessage;

function isRecord(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function isOptionalString(value: Parameters<typeof isString>[0]): boolean {
  return value === undefined || isString(value);
}

function isNavigationItem(value: unknown): value is PreviewNavigationItem {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isOptionalString(value.icon) &&
    isOptionalString(value.livePage) &&
    (value.status === undefined || isPageStatus(value.status))
  );
}

function isSidebarWidget(value: unknown): value is PreviewSidebarWidget {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.html) &&
    isOptionalString(value.css) &&
    isOptionalString(value.caption) &&
    isNumber(value.height) &&
    Number.isFinite(value.height)
  );
}

function isNavigationCategory(
  value: unknown,
): value is PreviewNavigationCategory {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isOptionalString(value.icon)
  );
}

function isNavigationSection(
  value: unknown,
): value is PreviewNavigationSection {
  return (
    isRecord(value) &&
    (value.category === undefined || isNavigationCategory(value.category)) &&
    Array.isArray(value.items) &&
    value.items.every(isNavigationItem)
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
    (value.editable === undefined || isBoolean(value.editable)) &&
    (value.wholeApp === undefined || isBoolean(value.wholeApp)) &&
    Array.isArray(value.sections) &&
    value.sections.every(isNavigationSection) &&
    (value.widgets === undefined ||
      (Array.isArray(value.widgets) && value.widgets.every(isSidebarWidget)))
  );
}

function isHeaderAction(value: unknown): value is PreviewHeaderAction {
  return (
    isRecord(value) &&
    isString(value.label) &&
    isOptionalString(value.icon) &&
    (value.color === undefined || isHeaderColor(value.color)) &&
    (value.variant === undefined || isHeaderVariant(value.variant))
  );
}

/** Whether `value` is a page header a `render` may carry, every button checked. */
export function isPreviewHeader(value: unknown): value is PreviewHeader {
  return (
    isRecord(value) &&
    isString(value.title) &&
    isOptionalString(value.icon) &&
    isOptionalString(value.description) &&
    (value.status === undefined || isPageStatus(value.status)) &&
    (value.actions === undefined ||
      (Array.isArray(value.actions) && value.actions.every(isHeaderAction)))
  );
}

function parseBlockRect(
  value: JsonValue | undefined,
): PreviewBlockRect | undefined {
  if (!isObjectValue(value) || !isString(value.path)) return undefined;
  const rect = parseRect(value.rect);
  return rect ? { path: value.path, rect } : undefined;
}

function parseBlockRects(
  value: JsonValue | undefined,
): PreviewBlockRect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = value.map(parseBlockRect);
  return blocks.every((block) => block !== undefined) ? blocks : undefined;
}

function isRenderMessage(
  value: Parameters<typeof isRecord>[0],
): value is PreviewRenderMessage {
  return (
    isRecord(value) &&
    value.channel === PREVIEW_CHANNEL &&
    value.type === "render" &&
    isPreviewTree(value.tree) &&
    (value.theme === undefined || isPreviewTheme(value.theme)) &&
    (value.locale === undefined || isString(value.locale)) &&
    (value.transparent === undefined || isBoolean(value.transparent)) &&
    (value.padding === undefined || isBoolean(value.padding)) &&
    (value.navigation === undefined || isPreviewNavigation(value.navigation)) &&
    (value.header === undefined || isPreviewHeader(value.header)) &&
    isOptionalString(value.live) &&
    (value.params === undefined ||
      (isRecord(value.params) && Object.values(value.params).every(isString)))
  );
}

function isThemeMessage(
  value: Parameters<typeof isRecord>[0],
): value is PreviewThemeMessage {
  return (
    isRecord(value) &&
    value.channel === PREVIEW_CHANNEL &&
    value.type === "theme" &&
    isPreviewTheme(value.theme)
  );
}

function isInspectMessage(
  value: Parameters<typeof isRecord>[0],
): value is PreviewInspectMessage {
  return (
    isRecord(value) &&
    value.channel === PREVIEW_CHANNEL &&
    value.type === "inspect" &&
    isBoolean(value.enabled)
  );
}

function isMinHeightMessage(
  value: Parameters<typeof isRecord>[0],
): value is PreviewMinHeightMessage {
  return (
    isRecord(value) &&
    value.channel === PREVIEW_CHANNEL &&
    value.type === "min-height" &&
    isNumber(value.height) &&
    Number.isFinite(value.height) &&
    value.height >= 0
  );
}

/**
 * The preview message `data` is, or undefined for anything else posted to the
 * window (another channel, a malformed tree): the page ignores those.
 */
export function parsePreviewMessage(
  data: Parameters<typeof isRecord>[0],
): PreviewInboundMessage | undefined {
  return isRenderMessage(data) ||
    isThemeMessage(data) ||
    isInspectMessage(data) ||
    isMinHeightMessage(data)
    ? data
    : undefined;
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

export function previewSelectPageMessage(): PreviewSelectPageMessage {
  return { channel: PREVIEW_CHANNEL, type: "select-page" };
}

export function previewNavigateMessage(
  id: string,
  record?: string,
): PreviewNavigateMessage {
  return record === undefined
    ? { channel: PREVIEW_CHANNEL, type: "navigate", id }
    : { channel: PREVIEW_CHANNEL, type: "navigate", id, record };
}

export function previewEscapeMessage(): PreviewEscapeMessage {
  return { channel: PREVIEW_CHANNEL, type: "escape" };
}

export function previewPressMessage(button: number): PreviewPressMessage {
  return { channel: PREVIEW_CHANNEL, type: "press", button };
}

export function previewSectionEditMessage(
  edit: MockupSectionEdit,
): PreviewSectionEditMessage {
  return { channel: PREVIEW_CHANNEL, type: "section-edit", edit };
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

export function previewMinHeightMessage(
  height: number,
): PreviewMinHeightMessage {
  return { channel: PREVIEW_CHANNEL, type: "min-height", height };
}

/** The fields of a posted message the outbound parsers read, unchecked. */
interface PostedFields {
  height?: JsonValue;
  message?: JsonValue;
  path?: JsonValue;
  blocks?: JsonValue;
  text?: JsonValue;
  rect?: JsonValue;
  font?: JsonValue;
  id?: JsonValue;
  record?: JsonValue;
  button?: JsonValue;
  edit?: JsonValue;
}

const OUTBOUND_PARSERS: Record<
  Extract<Parameters<typeof Object.hasOwn>[1], string>,
  (data: PostedFields) => PreviewOutboundMessage | undefined
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
  "select-page": () => previewSelectPageMessage(),
  navigate: ({ id, record }) =>
    isString(id) && (record === undefined || isString(record))
      ? previewNavigateMessage(id, record)
      : undefined,
  escape: () => previewEscapeMessage(),
  "section-edit": ({ edit }) => {
    const parsed = parseSectionEdit(edit);
    return parsed ? previewSectionEditMessage(parsed) : undefined;
  },
  press: ({ button }) =>
    isNumber(button) && Number.isInteger(button)
      ? previewPressMessage(button)
      : undefined,
};

/**
 * The message the embedded preview posted in `data`, or undefined for anything
 * else a window receives (another channel, an unknown or malformed message):
 * the embedding page ignores those.
 */
export function parsePreviewOutboundMessage(
  data: JsonValue | undefined,
): PreviewOutboundMessage | undefined {
  if (!isObjectValue(data) || data.channel !== PREVIEW_CHANNEL) {
    return undefined;
  }
  const type = data.type;
  if (!isString(type) || !Object.hasOwn(OUTBOUND_PARSERS, type))
    return undefined;
  return OUTBOUND_PARSERS[type]?.(data);
}
