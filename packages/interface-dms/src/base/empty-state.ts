import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import type { BaseComponentProps } from "./types";
import {
  blockActionsOption,
  blockCardOption,
  type BlockLinkAction,
  toneEnum,
} from "./display";
import { TONES, type Tone } from "./types/tone";

/** Why a block is empty: see `EmptyStateVariant`. */
export const EMPTY_STATE_VARIANTS = [
  "no-data",
  "no-result",
  "no-access",
  "error",
] as const;

/** Why it is empty: sets the default icon, the well tone and the live role. */
export type EmptyStateVariant = (typeof EMPTY_STATE_VARIANTS)[number];

/** The sizes of an empty state. */
export const EMPTY_STATE_SIZES = ["sm", "md", "lg"] as const;

export type EmptyStateSize = (typeof EMPTY_STATE_SIZES)[number];

/** The options `EmptyState` takes. */
export interface EmptyStateProps extends BaseComponentProps {
  /** `$`-prefixed for an i18n key, like every text of the block. */
  title: string;
  description?: string;
  variant?: EmptyStateVariant;
  /** Overrides the variant's icon. */
  icon?: string;
  /** Overrides the variant's well tone. */
  tone?: Tone;
  /** Hatched panel behind the content. */
  hatched?: boolean;
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
  options: EmptyStateProps,
): ComponentBuilder<EmptyStateProps> {
  return new ComponentBuilder<EmptyStateProps>(EMPTY_STATE_COMPONENT_NAME)
    .options({ ...EMPTY_STATE_DEFAULTS, ...options })
    .meta({
      name: options.title || "Empty state",
      icon: options.icon || EMPTY_STATE_ICON,
    });
}

/** The options `EmptyState` accepts. */
export const EmptyStateSchema = z.object({
  title: ui(z.string().describe("Title of the empty state."), {
    label: "Title",
    group: "content",
    initial: "Nothing here yet",
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
  tone: ui(toneEnum(TONES).optional(), {
    label: "Tone",
    group: "appearance",
    widget: "select",
  }),
  size: ui(z.enum(EMPTY_STATE_SIZES).default(EMPTY_STATE_DEFAULTS.size), {
    label: "Size",
    group: "appearance",
    widget: "segmented",
  }),
  hatched: ui(z.boolean().optional().describe("Hatched panel behind it."), {
    label: "Hatched",
    group: "appearance",
    widget: "switch",
  }),
  card: blockCardOption(EMPTY_STATE_DEFAULTS.card),
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
