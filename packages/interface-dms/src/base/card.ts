import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { blockActionsOption, type BlockLinkAction } from "./display";
import type { BaseComponentProps } from "./types";

/** The looks of a card. */
export const CARD_VARIANTS = ["default", "elevated"] as const;

export type CardVariant = (typeof CARD_VARIANTS)[number];

/** The options `Card` takes. */
export interface CardProps extends BaseComponentProps {
  /** Eyebrow title of the head; `$`-prefixed for an i18n key. */
  title?: string;
  /** Mono count after the title. */
  count?: number | string;
  /** One dim line under the title. */
  description?: string;
  /** Link buttons on the right of the head. */
  actions?: BlockLinkAction[];
  /** Muted text in the foot band. */
  footer?: string;
  /** Body padding; turn it off for a list or a table running edge to edge. */
  padded?: boolean;
  /** `elevated`: stronger shadow, for a card on an empty backdrop. */
  variant?: CardVariant;
}

const CARD_COMPONENT_NAME = "dms-card-block";
const CARD_ICON = "i-ph-square";
const CARD_DEFAULTS = { padded: true, variant: "default" } as const;

/** Slot a child fills in the card head, next to the link actions. */
export const CARD_ACTIONS_SLOT = "actions";
/** Slot a child fills in the foot band. */
export const CARD_FOOTER_SLOT = "footer";

/**
 * Card — a titled card holding other blocks.
 *
 * Children without a slot stack in the body. A child placed with
 * `{ slot: "actions" }` joins the head's link actions, one placed with
 * `{ slot: "footer" }` fills the foot band; each of those slots holds one
 * child, so several go in an `HStack`.
 *
 * @example
 * ```typescript
 * Card({ title: "Connectors", count: 4, actions: [{ label: "View all", to: "/integrations" }] })
 *   .child("list", KeyValueList({ card: false, items: [...] }))
 *   .child("foot", HStack().child("sync", ...), { slot: "footer" })
 * ```
 */
export function Card(options?: CardProps): ComponentBuilder<CardProps> {
  return new ComponentBuilder<CardProps>(CARD_COMPONENT_NAME)
    .options({ ...CARD_DEFAULTS, ...options })
    .meta({ name: options?.title || "Card", icon: CARD_ICON });
}

/** The options `Card` accepts. */
export const CardSchema = z.object({
  title: ui(z.string().optional().describe("Eyebrow title of the head."), {
    label: "Title",
    group: "content",
  }),
  count: ui(
    z
      .union([z.number(), z.string()])
      .optional()
      .describe("Mono count after the title."),
    { label: "Count", group: "content" },
  ),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
  }),
  actions: blockActionsOption("Link buttons on the right of the head."),
  footer: ui(z.string().optional().describe("Muted text in the foot band."), {
    label: "Footer",
    group: "content",
  }),
  padded: ui(
    z
      .boolean()
      .default(CARD_DEFAULTS.padded)
      .describe("Pads the body; off for a list or table edge to edge."),
    { label: "Padded body", group: "layout", widget: "switch" },
  ),
  variant: ui(z.enum(CARD_VARIANTS).default(CARD_DEFAULTS.variant), {
    label: "Variant",
    group: "appearance",
    widget: "segmented",
  }),
}) satisfies BlockOptionsFor<CardProps>;

RegisterBlockType({
  type: "Card",
  componentName: CARD_COMPONENT_NAME,
  schema: CardSchema,
  container: true,
  slots: [
    {
      id: CARD_ACTIONS_SLOT,
      label: "Head actions",
      description: "One block next to the head's link actions.",
    },
    {
      id: CARD_FOOTER_SLOT,
      label: "Footer",
      description: "One block in the foot band.",
    },
  ],
  meta: {
    name: "Card",
    icon: CARD_ICON,
    description: "Titled card; its children stack in the body.",
    group: "layout",
  },
});
