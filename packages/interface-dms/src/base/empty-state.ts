import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  blockActionsOption,
  type BlockLinkAction,
  DISPLAY_TONES,
  type DisplayTone,
} from "./display";

export const EMPTY_STATE_VARIANTS = [
  "no-data",
  "no-result",
  "no-access",
  "error",
] as const;

/** Why it is empty: sets the default icon, the well tone and the live role. */
export type EmptyStateVariant = (typeof EMPTY_STATE_VARIANTS)[number];

export const EMPTY_STATE_SIZES = ["sm", "md", "lg"] as const;

export type EmptyStateSize = (typeof EMPTY_STATE_SIZES)[number];

export interface EmptyStateProps {
  /** `$`-prefixed for an i18n key, like every text of the block. */
  title: string;
  description?: string;
  variant?: EmptyStateVariant;
  /** Overrides the variant's icon. */
  icon?: string;
  /** Overrides the variant's well tone. */
  tone?: DisplayTone;
  /** Hatched panel behind the content. */
  framed?: boolean;
  size?: EmptyStateSize;
  actions?: BlockLinkAction[];
  /** Card surface around it; turn it off inside a `Card` block. */
  card?: boolean;
}

const EMPTY_STATE_COMPONENT_NAME = "dms-empty-state-block";
const EMPTY_STATE_ICON = "i-ph-tray";
const EMPTY_STATE_DEFAULTS = {
  variant: "no-data",
  size: "md",
  card: true,
} as const;

/**
 * EmptyState — an icon well, a title, a short explanation and the actions
 * that fit the case: a first-run page, a section with nothing in it yet, a
 * page the viewer cannot use.
 *
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `EmptyState()`.
 *
 * @example
 * ```typescript
 * EmptyState({
 *   title: "No invoices yet",
 *   description: "Invoices appear here once a customer is billed.",
 *   actions: [{ label: "Create an invoice", to: "/sales/invoices/new" }],
 * })
 * ```
 */
export function EmptyState(
  options?: EmptyStateProps,
): ComponentBuilder<EmptyStateProps> {
  return new ComponentBuilder<EmptyStateProps>(EMPTY_STATE_COMPONENT_NAME)
    .options({ ...EMPTY_STATE_DEFAULTS, ...options } as EmptyStateProps)
    .meta({
      name: options?.title || "Empty state",
      icon: options?.icon || EMPTY_STATE_ICON,
    });
}

/** The options `EmptyState` accepts. */
export const EmptyStateSchema = z.object({
  title: ui(z.string().describe("Title of the empty state."), {
    label: "Title",
    group: "content",
  }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  actions: blockActionsOption("Buttons under the text; the first one leads."),
  variant: ui(
    z
      .enum(EMPTY_STATE_VARIANTS)
      .default(EMPTY_STATE_DEFAULTS.variant)
      .describe("Why it is empty; sets the icon and the tone."),
    {
      label: "Variant",
      group: "appearance",
      widget: "select",
      valueLabels: {
        "no-data": "No data yet",
        "no-result": "No result",
        "no-access": "No access",
        error: "Error",
      },
    },
  ),
  icon: ui(z.string().optional().describe("Overrides the variant's icon."), {
    label: "Icon",
    group: "appearance",
    widget: "icon",
  }),
  tone: ui(z.enum(DISPLAY_TONES).optional(), {
    label: "Tone",
    group: "appearance",
    widget: "select",
  }),
  size: ui(z.enum(EMPTY_STATE_SIZES).default(EMPTY_STATE_DEFAULTS.size), {
    label: "Size",
    group: "appearance",
    widget: "segmented",
  }),
  framed: ui(z.boolean().optional().describe("Hatched panel behind it."), {
    label: "Hatched",
    group: "appearance",
    widget: "switch",
  }),
  card: ui(
    z
      .boolean()
      .default(EMPTY_STATE_DEFAULTS.card)
      .describe("Card surface around it."),
    { label: "In a card", group: "appearance", widget: "switch" },
  ),
}) satisfies BlockOptionsFor<EmptyStateProps>;

RegisterBlockType({
  type: "EmptyState",
  componentName: EMPTY_STATE_COMPONENT_NAME,
  schema: EmptyStateSchema,
  meta: {
    name: "Empty state",
    icon: EMPTY_STATE_ICON,
    description: "Says why there is nothing here, and what to do next.",
    group: "content",
  },
});
