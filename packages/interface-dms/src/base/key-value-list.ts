import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  blockCardOption,
  type BlockItemsSource,
  blockItemsSourceOptions,
} from "./display";
import { toneEnum } from "./internal/display";
import { TONES, type Tone } from "./types/tone";
import { blockTextSchema } from "./internal/composed-text";
import type { BaseComponentProps } from "./types";
import type { BlockText } from "./types/composed-text";

/**
 * How a value is drawn: `text` plain, `status` a tinted pill, `money` a
 * currency amount, `date` a localized date, `link` an accent link, `mono` an
 * identifier or a figure in the mono font.
 */
export const KEY_VALUE_TYPES = [
  "text",
  "status",
  "money",
  "date",
  "link",
  "mono",
] as const;

export type KeyValueType = (typeof KEY_VALUE_TYPES)[number];

/** One label / value row. */
export interface KeyValueListItem {
  /** Stable key; the position is used without one. */
  id?: string;
  /** `$`-prefixed for an i18n key, or a `ComposedText`. */
  label: BlockText;
  /**
   * Raw value: an ISO date for `date`, a number for `money`. A
   * `ComposedText` is composed in the reader's language and drawn as text,
   * whatever the `type` — its parameters already say how each value is
   * written.
   */
  value?: BlockText | number | null;
  type?: KeyValueType;
  /** Route, `#anchor` or URL the value links to. */
  to?: string;
  /** Text colour, or the pill tone of a `status` value. */
  tone?: Tone;
  /** Dim note after the value: a string or a `ComposedText`. */
  detail?: BlockText;
  /** ISO 4217 code of a `money` value; overrides the list's `currency`. */
  currency?: string;
}

/** The options `KeyValueList` takes. */
export interface KeyValueListProps
  extends BaseComponentProps, BlockItemsSource {
  items?: KeyValueListItem[];
  /** Tighter rows, for side panels. */
  dense?: boolean;
  /** Columns on wide screens (1–3). */
  columns?: number;
  /** Default ISO 4217 code of `money` values. */
  currency?: string;
  /** Eyebrow title of the card head. */
  title?: string;
  /** Card surface around the list; turn it off inside a `Card` block. */
  card?: boolean;
}

const KEY_VALUE_LIST_COMPONENT_NAME = "dms-key-value-list-block";
const KEY_VALUE_LIST_ICON = "i-ph-list-dashes";
const KEY_VALUE_LIST_DEFAULTS = { card: true, columns: 1 } as const;

/**
 * KeyValueList — label / value rows (an account summary, a record's facts, a
 * recap), each value drawn by its type.
 *
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `KeyValueList()`.
 *
 * @example
 * ```typescript
 * KeyValueList({
 *   title: "Subscription",
 *   items: [
 *     { label: "Plan", value: "Business" },
 *     { label: "Status", value: "Past due", type: "status", tone: "error" },
 *     { label: "Next invoice", value: 588, type: "money" },
 *   ],
 * })
 * ```
 */
export function KeyValueList(
  options?: KeyValueListProps,
): ComponentBuilder<KeyValueListProps> {
  return new ComponentBuilder<KeyValueListProps>(KEY_VALUE_LIST_COMPONENT_NAME)
    .options({ ...KEY_VALUE_LIST_DEFAULTS, ...options })
    .meta({
      name: options?.title || "Key / value list",
      icon: KEY_VALUE_LIST_ICON,
    });
}

const KeyValueListItemSchema = z.object({
  id: ui(z.string().optional(), { label: "Key", advanced: true }),
  label: ui(blockTextSchema(), { label: "Label", widget: "text" }),
  value: ui(z.union([blockTextSchema(), z.number()]).nullable().optional(), {
    label: "Value",
    widget: "text",
  }),
  type: ui(z.enum(KEY_VALUE_TYPES).optional(), {
    label: "Type",
    widget: "select",
  }),
  to: ui(z.string().optional(), { label: "Link", widget: "url" }),
  tone: ui(toneEnum(TONES).optional(), {
    label: "Tone",
    widget: "select",
  }),
  detail: ui(blockTextSchema().optional(), { label: "Detail", widget: "text" }),
  currency: ui(z.string().optional(), { label: "Currency", advanced: true }),
}) satisfies BlockOptionsFor<KeyValueListItem>;

/** The options `KeyValueList` accepts. */
export const KeyValueListSchema = z.object({
  title: ui(z.string().optional().describe("Eyebrow title of the card."), {
    label: "Title",
    group: "content",
  }),
  items: ui(
    z.array(KeyValueListItemSchema).optional().describe("The rows, in order."),
    { label: "Rows", group: "content" },
  ),
  card: blockCardOption(KEY_VALUE_LIST_DEFAULTS.card),
  dense: ui(z.boolean().optional().describe("Tighter rows."), {
    label: "Dense",
    group: "appearance",
    widget: "switch",
  }),
  columns: ui(
    z
      .number()
      .int()
      .min(1)
      .max(3)
      .default(KEY_VALUE_LIST_DEFAULTS.columns)
      .describe("Columns on wide screens."),
    { label: "Columns", group: "layout", widget: "number", min: 1, max: 3 },
  ),
  currency: ui(
    z.string().optional().describe("Default ISO code of money values."),
    { label: "Currency", group: "appearance" },
  ),
  ...blockItemsSourceOptions(),
}) satisfies BlockOptionsFor<KeyValueListProps>;

RegisterBlockType({
  type: "KeyValueList",
  componentName: KEY_VALUE_LIST_COMPONENT_NAME,
  schema: KeyValueListSchema,
  meta: {
    name: "Key / value list",
    icon: KEY_VALUE_LIST_ICON,
    description: "Label and value rows, each value drawn by its type.",
    group: "content",
  },
});
