import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  blockActionsOption,
  blockFetchUrlMethodOption,
  blockFetchUrlOption,
  type BlockLinkAction,
  blockPeriodScopeOption,
  blockRealtimeTopicOption,
} from "./display";
import { toneEnum } from "./internal/display";
import { blockTextSchema } from "./internal/composed-text";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";
import type { BaseComponentProps, EnumOption } from "./types";
import type { CustomButtonSerialized } from "./types/custom-button";
import type { HttpMethod } from "./types/http";
import type { BlockText } from "./types/composed-text";
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

/**
 * A button a fetched banner offers besides its links: the target of a page
 * header or toolbar button (`CustomButton`) — an API call, a modal, a drawer,
 * a quick action, a link or an export — with its confirmation, as the route
 * serializes it. Pressing one that changes something refreshes the page's
 * blocks, the banner included.
 */
export type BannerButtonAction = Pick<
  CustomButtonSerialized,
  "label" | "icon" | "variant" | "color" | "target" | "confirm"
>;

/** An action of a banner: a link, or a button only a route answers. */
export type BannerAction = BlockLinkAction | BannerButtonAction;

/**
 * What a banner shows. A banner's `fetchUrl` answers it, or `null`, `{}` or
 * a 204 for no banner at all; its fields override the static options one by
 * one.
 */
export interface BannerContent {
  /**
   * `$`-prefixed for an i18n key, like every text of the block, or a
   * `ComposedText` composed in the reader's language ("Payment failed, retry
   * {date}").
   */
  title?: BlockText;
  /** A string or a `ComposedText`, like `title`. */
  description?: BlockText;
  tone?: BannerTone;
  /** Overrides the tone's icon. */
  icon?: string;
  size?: BannerSize;
  actions?: BannerAction[];
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

/** The options `Banner` takes. */
export interface BannerProps extends BaseComponentProps, BannerContent {
  /**
   * Link buttons. A button running a target (`BannerButtonAction`) is only
   * answered by `fetchUrl`, which decides per request who is shown it.
   */
  actions?: BlockLinkAction[];
  /**
   * Route answering the banner's `BannerContent`, or `null`, `{}` or a 204
   * when there is nothing to tell: the block then draws nothing, and nothing
   * either until its first answer lands. It may name the page it is shown
   * on: `{{params.X}}` and `{{query.X}}` name the page URL, as in
   * `BlockItemsSource.fetchUrl`.
   *
   * Read again, keeping the banner on screen, when the page asks its blocks
   * to refresh: see `BlockFunctions.REFRESH_PAGE`.
   */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Id of the PeriodSelector whose period is sent to `fetchUrl`. */
  periodScope?: string;
  /** Realtime topic(s); the banner reads `fetchUrl` again when they publish. */
  realtimeTopic?: string | string[];
}

const BANNER_COMPONENT_NAME = "dms-banner-block";
const BANNER_ICON = "i-ph-megaphone";
const BANNER_DEFAULTS = { tone: "info", size: "md" } as const;

/**
 * Banner — a notice across the top of a page or a card: a tinted wash, a
 * boxed icon, a title and a line of explanation, with link actions and an
 * optional dismiss that is remembered.
 *
 * With a `fetchUrl` the route decides what the banner says, and whether there
 * is a banner at all: a computed health status, an outage notice.
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
 *
 * Banner({ fetchUrl: "/api/mailing/{{params.id}}/provider-status" })
 * ```
 */
export function Banner(options?: BannerProps): ComponentBuilder<BannerProps> {
  const builder = new ComponentBuilder<BannerProps>(BANNER_COMPONENT_NAME)
    .options({ ...BANNER_DEFAULTS, ...options })
    .meta({
      name: (typeof options?.title === "string" && options.title) || "Banner",
      icon: options?.icon || BANNER_ICON,
    });
  return attachRealtimeTopicsHook(builder, options?.realtimeTopic);
}

/** The options `Banner` accepts. */
export const BannerSchema = z.object({
  title: ui(blockTextSchema().optional(), {
    label: "Title",
    group: "content",
    widget: "text",
  }),
  description: ui(blockTextSchema().optional(), {
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
  fetchUrl: blockFetchUrlOption(
    "Route answering the banner's content, or nothing to hide it.",
  ),
  fetchUrlMethod: blockFetchUrlMethodOption(),
  periodScope: blockPeriodScopeOption(),
  realtimeTopic: blockRealtimeTopicOption(),
}) satisfies BlockOptionsFor<BannerProps>;

RegisterBlockType({
  type: "Banner",
  componentName: BANNER_COMPONENT_NAME,
  schema: BannerSchema,
  meta: {
    name: "Banner",
    icon: BANNER_ICON,
    description:
      "Notice with a tone, link actions and a remembered dismiss, static or fetched.",
    group: "content",
  },
});
