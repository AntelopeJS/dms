import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { blockActionsOption, type BlockLinkAction } from "./display";
import { toneEnum } from "./internal/display";
import type { BaseComponentProps } from "./types";
import type { Tone } from "./types/tone";

/** The tones a banner washes with. */
export const BANNER_TONES = [
  "info",
  "success",
  "warning",
  "error",
  "primary",
] as const satisfies readonly Tone[];

export type BannerTone = Extract<Tone, (typeof BANNER_TONES)[number]>;

/** The sizes of a banner. */
export const BANNER_SIZES = ["md", "sm"] as const;

/** `md` boxed banner; `sm` compact one-line banner, for cards and panels. */
export type BannerSize = (typeof BANNER_SIZES)[number];

/** The options `Banner` takes. */
export interface BannerProps extends BaseComponentProps {
  /** `$`-prefixed for an i18n key, like every text of the block. */
  title?: string;
  description?: string;
  tone?: BannerTone;
  /** Overrides the tone's icon. */
  icon?: string;
  size?: BannerSize;
  actions?: BlockLinkAction[];
  /** Adds a close button; the dismissal is remembered. */
  dismissible?: boolean;
  /**
   * Key the dismissal is remembered under (a cookie, one year). Defaults to
   * the block's id on its page (`.child("welcome", Banner(…))` → `welcome`),
   * which holds when blocks are added or moved; change it to show the banner
   * again.
   */
  dismissKey?: string;
}

const BANNER_COMPONENT_NAME = "dms-banner-block";
const BANNER_ICON = "i-ph-megaphone";
const BANNER_DEFAULTS = { tone: "info", size: "md" } as const;

/**
 * Banner — a notice across the top of a page or a card: a tinted wash, a
 * boxed icon, a title and a line of explanation, with link actions and an
 * optional dismiss that is remembered.
 *
 * Distinct from `RegisterLayoutBanner` (the dashboard-wide strip under the
 * header): this one is a block placed on one page.
 *
 * @example
 * ```typescript
 * Banner({
 *   tone: "warning",
 *   title: "Beta",
 *   description: "Numbers refresh every 15 minutes.",
 *   dismissible: true,
 *   dismissKey: "sales-beta-2026",
 * })
 * ```
 */
export function Banner(options?: BannerProps): ComponentBuilder<BannerProps> {
  return new ComponentBuilder<BannerProps>(BANNER_COMPONENT_NAME)
    .options({ ...BANNER_DEFAULTS, ...options })
    .meta({
      name: options?.title || "Banner",
      icon: options?.icon || BANNER_ICON,
    });
}

/** The options `Banner` accepts. */
export const BannerSchema = z.object({
  title: ui(z.string().optional(), { label: "Title", group: "content" }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  actions: blockActionsOption(
    "Buttons on the right; the last one is the main action.",
  ),
  tone: ui(
    toneEnum(BANNER_TONES)
      .default(BANNER_DEFAULTS.tone)
      .describe("Colour of the wash and the icon."),
    { label: "Tone", group: "appearance", widget: "select" },
  ),
  icon: ui(z.string().optional().describe("Overrides the tone's icon."), {
    label: "Icon",
    group: "appearance",
    widget: "icon",
  }),
  size: ui(
    z
      .enum(BANNER_SIZES)
      .default(BANNER_DEFAULTS.size)
      .describe("`sm` is the compact one-line banner."),
    {
      label: "Size",
      group: "appearance",
      widget: "segmented",
      valueLabels: { md: "Regular", sm: "Compact" },
    },
  ),
  dismissible: ui(
    z.boolean().optional().describe("Adds a close button, remembered."),
    { label: "Dismissible", group: "behavior", widget: "switch" },
  ),
  dismissKey: ui(
    z
      .string()
      .optional()
      .describe("Key the dismissal is remembered under; change it to reset."),
    { label: "Dismiss key", group: "behavior", advanced: true },
  ),
}) satisfies BlockOptionsFor<BannerProps>;

RegisterBlockType({
  type: "Banner",
  componentName: BANNER_COMPONENT_NAME,
  schema: BannerSchema,
  meta: {
    name: "Banner",
    icon: BANNER_ICON,
    description: "Notice with a tone, link actions and a remembered dismiss.",
    group: "content",
  },
});
