import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { type BlockLinkAction, BlockLinkActionSchema } from "./display";
import { blockTextSchema } from "./internal/composed-text";
import type { BaseComponentProps } from "./types";
import type { BlockText } from "./types/composed-text";

/** How a hero lines up its texts. */
export const HERO_ALIGNMENTS = ["left", "center"] as const;

export type HeroAlign = (typeof HERO_ALIGNMENTS)[number];

/** The sizes of a hero: `lg` for a landing page, `md` for a section opener. */
export const HERO_SIZES = ["md", "lg"] as const;

export type HeroSize = (typeof HERO_SIZES)[number];

/**
 * What a hero is drawn on: `plain` the page itself, `gradient` a soft wash of
 * the theme's primary colour, `card` a bordered card.
 */
export const HERO_BACKGROUNDS = ["plain", "gradient", "card"] as const;

export type HeroBackground = (typeof HERO_BACKGROUNDS)[number];

/** Where a hero's media (its image or icons) sits: beside the texts or under them. */
export const HERO_MEDIA_POSITIONS = ["side", "below"] as const;

export type HeroMediaPosition = (typeof HERO_MEDIA_POSITIONS)[number];

/** The most actions a hero shows: one primary and two secondary. */
export const HERO_MAX_ACTIONS = 3;

/** The most figures a hero's `proof` lists. */
export const HERO_MAX_PROOF = 4;

/** The most icons a hero's icon composition holds. */
export const HERO_MAX_ICONS = 3;

/** A figure under a hero's lead: "99.9 %" over "uptime last year". */
export interface HeroProof {
  /** The figure, drawn large: a string (`$` for an i18n key) or a `ComposedText`. */
  value: BlockText;
  /** What the figure counts, drawn under it. */
  label: BlockText;
}

/** The options `Hero` takes. */
export interface HeroProps extends BaseComponentProps {
  /** A short label above the headline, in small capitals. */
  eyebrow?: BlockText;
  /**
   * The headline, in display size; it may run over two lines. Words wrapped
   * in `*asterisks*` are drawn in the theme's primary colour: "Your data,
   * *one place*".
   */
  title?: BlockText;
  /**
   * Words of the headline drawn in the theme's primary colour, when the
   * headline marks none with `*asterisks*`: its first occurrence is
   * highlighted. `$` for an i18n key, like the headline it is looked up in.
   */
  highlight?: BlockText;
  /** The lead paragraph under the headline, in a large body size. */
  lead?: BlockText;
  /**
   * Up to three link buttons: the first is the primary action, the others
   * secondary. `to` takes a DMS route, an `#anchor` or an absolute URL.
   */
  actions?: BlockLinkAction[];
  /** Figures shown under the lead, up to four. */
  proof?: HeroProof[];
  /**
   * An image beside or under the texts: a public URL or the URL of a file
   * from the media library, `http(s)` or a path (any other address draws no
   * image). Takes precedence over `icons`.
   */
  image?: string;
  /**
   * The image's alternative text. Without one the image is decorative and
   * hidden from screen readers.
   */
  imageAlt?: BlockText;
  /** An icon composition beside or under the texts: up to three icons. */
  icons?: string[];
  /** Where the image or the icons sit. Defaults to `side`. */
  mediaPosition?: HeroMediaPosition;
  /** Defaults to `left`. */
  align?: HeroAlign;
  /** Defaults to `lg`. */
  size?: HeroSize;
  /** Defaults to `plain`. */
  background?: HeroBackground;
}

const HERO_COMPONENT_NAME = "dms-hero-block";
const HERO_ICON = "i-ph-flag-banner";
const HERO_DEFAULTS = {
  align: "left",
  size: "lg",
  background: "plain",
  mediaPosition: "side",
} as const;

/**
 * Hero — the opening of a landing or onboarding page: an eyebrow, a large
 * headline with highlighted words, a lead paragraph, up to three actions,
 * a few figures as proof, and an image or an icon composition beside or
 * under the texts.
 *
 * Every text takes a string (`$`-prefixed for an i18n key) or a
 * `ComposedText`.
 *
 * @example
 * ```typescript
 * Hero({
 *   eyebrow: "$home.hero.eyebrow",
 *   title: "Every order, *one place*",
 *   lead: "Follow orders from checkout to delivery, and answer customers in seconds.",
 *   actions: [
 *     { label: "Open orders", to: "/orders/orders-list" },
 *     { label: "Read the guide", to: "https://example.com/guide" },
 *   ],
 *   proof: [
 *     { value: "2 min", label: "to set up" },
 *     { value: "99.9 %", label: "uptime" },
 *   ],
 *   icons: ["i-ph-package", "i-ph-truck", "i-ph-smiley"],
 *   background: "gradient",
 * })
 * ```
 */
export function Hero(options?: HeroProps): ComponentBuilder<HeroProps> {
  return new ComponentBuilder<HeroProps>(HERO_COMPONENT_NAME)
    .options({ ...HERO_DEFAULTS, ...options })
    .meta({
      name: (typeof options?.title === "string" && options.title) || "Hero",
      icon: HERO_ICON,
    });
}

const HeroProofSchema = z.object({
  value: ui(blockTextSchema().describe("The figure."), { label: "Value" }),
  label: ui(blockTextSchema().describe("What the figure counts."), {
    label: "Label",
  }),
}) satisfies BlockOptionsFor<HeroProof>;

/** The options `Hero` accepts. */
export const HeroSchema = z.object({
  eyebrow: ui(
    blockTextSchema().optional().describe("Short label above the headline."),
    { label: "Eyebrow", group: "content", widget: "text" },
  ),
  title: ui(
    blockTextSchema()
      .optional()
      .describe("The headline; *words in asterisks* are highlighted."),
    { label: "Headline", group: "content", widget: "text" },
  ),
  highlight: ui(
    blockTextSchema()
      .optional()
      .describe("Words of the headline to highlight."),
    { label: "Highlighted words", group: "content", widget: "text" },
  ),
  lead: ui(
    blockTextSchema().optional().describe("Paragraph under the headline."),
    { label: "Lead", group: "content", widget: "textarea" },
  ),
  actions: ui(
    z
      .array(BlockLinkActionSchema)
      .max(HERO_MAX_ACTIONS)
      .optional()
      .describe("Up to three buttons; the first is the main action."),
    { label: "Actions", group: "content" },
  ),
  proof: ui(
    z
      .array(HeroProofSchema)
      .max(HERO_MAX_PROOF)
      .optional()
      .describe("Figures under the lead, up to four."),
    { label: "Figures", group: "content" },
  ),
  image: ui(
    z
      .string()
      .optional()
      .describe("Address of an image shown beside or under the texts."),
    { label: "Image", group: "content", widget: "url" },
  ),
  imageAlt: ui(
    blockTextSchema()
      .optional()
      .describe("Describes the image for screen readers."),
    { label: "Image description", group: "content", widget: "text" },
  ),
  icons: ui(
    z
      .array(ui(z.string(), { widget: "icon" }))
      .max(HERO_MAX_ICONS)
      .optional()
      .describe("Up to three icons, when there is no image."),
    { label: "Icons", group: "content" },
  ),
  mediaPosition: ui(
    z
      .enum(HERO_MEDIA_POSITIONS)
      .default(HERO_DEFAULTS.mediaPosition)
      .describe("Where the image or the icons sit."),
    {
      label: "Media position",
      group: "layout",
      widget: "segmented",
      valueLabels: { side: "Beside", below: "Below" },
    },
  ),
  align: ui(
    z
      .enum(HERO_ALIGNMENTS)
      .default(HERO_DEFAULTS.align)
      .describe("How the texts line up."),
    {
      label: "Alignment",
      group: "layout",
      widget: "segmented",
      valueLabels: { left: "Left", center: "Centre" },
    },
  ),
  size: ui(
    z
      .enum(HERO_SIZES)
      .default(HERO_DEFAULTS.size)
      .describe("Large for a landing page, medium for a section."),
    {
      label: "Size",
      group: "appearance",
      widget: "segmented",
      valueLabels: { md: "Medium", lg: "Large" },
    },
  ),
  background: ui(
    z
      .enum(HERO_BACKGROUNDS)
      .default(HERO_DEFAULTS.background)
      .describe("What the hero is drawn on."),
    {
      label: "Background",
      group: "appearance",
      widget: "segmented",
      valueLabels: { plain: "Plain", gradient: "Gradient", card: "Card" },
    },
  ),
}) satisfies BlockOptionsFor<HeroProps>;

RegisterBlockType({
  type: "Hero",
  componentName: HERO_COMPONENT_NAME,
  schema: HeroSchema,
  meta: {
    name: "Hero",
    icon: HERO_ICON,
    description:
      "Opening of a landing page: headline, lead, actions, figures and media.",
    group: "content",
  },
});
