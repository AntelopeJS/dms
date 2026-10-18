import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { blockFetchUrlMethodOption, blockFetchUrlOption } from "./display";
import type { BaseComponentProps, EnumOption } from "./types";
import type { HttpMethod } from "./types/http";

/**
 * The Markdown a `Prose` block shows: the text itself, a `$`-prefixed i18n
 * key, or one text per locale (`{ "fr-FR": "…", "en-GB": "…" }`).
 *
 * A per-locale map is the safer way to translate Markdown: an i18n message is
 * compiled by vue-i18n, which reads `{`, `}`, `|` and `@` as its own syntax.
 * A `$` key holding Markdown has to write those characters as literal
 * interpolations — `{'{'}`, `{'}'}`, `{'|'}`, `{'@'}` — a table's pipes
 * included.
 */
export type ProseContent = string | Record<string, string>;

/** How wide a `Prose` block runs. */
export const PROSE_WIDTHS = ["readable", "wide"] as const;

/**
 * `readable` keeps lines near 72 characters, the comfortable measure for
 * long text; `wide` takes the width of the page.
 */
export type ProseWidth = (typeof PROSE_WIDTHS)[number];

/** What the `fetchUrl` of a `Prose` block answers. */
export interface ProseResponse {
  /** Markdown in the reader's language. */
  markdown: string;
}

/** The options `Prose` takes. */
export interface ProseProps extends BaseComponentProps {
  /** The Markdown shown: see {@link ProseContent}. */
  content?: ProseContent;
  /**
   * Route answering a {@link ProseResponse} (`{ markdown }`), which replaces
   * `content`. It is asked in the reader's language: the request carries it
   * in the `x-content-language` header, and the block asks again when the
   * reader switches language. `{{params.X}}` and `{{query.X}}` name the page
   * URL, as in `BlockItemsSource.fetchUrl`; it is read again when the page
   * asks its blocks to refresh.
   */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Lists the `##` and `###` headings above the text. Defaults to `false`. */
  toc?: boolean;
  /** Defaults to `readable`. */
  width?: ProseWidth;
}

const PROSE_COMPONENT_NAME = "dms-prose-block";
const PROSE_ICON = "i-ph-article";
const PROSE_DEFAULTS = { toc: false, width: "readable" } as const;

/**
 * Prose — long-form text written in Markdown: a guide, release notes, an
 * onboarding page, terms to read.
 *
 * It draws headings (with anchors), paragraphs, emphasis, links, lists and
 * task lists, quotes and `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` /
 * `[!WARNING]` / `[!CAUTION]` callouts, inline and fenced code (with a copy
 * button), tables, rules and images (a title becomes the caption). Raw HTML
 * is never rendered, and a link or image whose address is not `http(s)`,
 * `mailto:`, `tel:`, a path or an `#anchor` is shown as text. A link to a DMS
 * route opens in place; one to another site opens in a new tab.
 *
 * @example
 * ```typescript
 * Prose({
 *   toc: true,
 *   content: {
 *     "en-GB": "## Getting started\n\nImport your customers, then **invite your team**.",
 *     "fr-FR": "## Premiers pas\n\nImportez vos clients, puis **invitez votre équipe**.",
 *   },
 * })
 *
 * Prose({ fetchUrl: "/api/help/articles/{{params.slug}}" })
 * ```
 */
export function Prose(options?: ProseProps): ComponentBuilder<ProseProps> {
  return new ComponentBuilder<ProseProps>(PROSE_COMPONENT_NAME)
    .options({ ...PROSE_DEFAULTS, ...options })
    .meta({ name: "Prose", icon: PROSE_ICON });
}

/** The options `Prose` accepts. */
export const ProseSchema = z.object({
  content: ui(
    z
      .union([z.string(), z.record(z.string())])
      .optional()
      .describe("Markdown, a `$` i18n key, or one Markdown text per locale."),
    { label: "Text", group: "content", widget: "textarea" },
  ),
  toc: ui(
    z
      .boolean()
      .default(PROSE_DEFAULTS.toc)
      .describe("Lists the headings above the text."),
    { label: "Table of contents", group: "features", widget: "switch" },
  ),
  width: ui(
    z
      .enum(PROSE_WIDTHS)
      .default(PROSE_DEFAULTS.width)
      .describe("Readable keeps lines short; wide takes the page width."),
    {
      label: "Width",
      group: "layout",
      widget: "segmented",
      valueLabels: { readable: "Readable", wide: "Wide" },
    },
  ),
  fetchUrl: blockFetchUrlOption(
    "Route answering `{ markdown }` in the reader's language; when set it replaces the text.",
  ),
  fetchUrlMethod: blockFetchUrlMethodOption(),
}) satisfies BlockOptionsFor<ProseProps>;

RegisterBlockType({
  type: "Prose",
  componentName: PROSE_COMPONENT_NAME,
  schema: ProseSchema,
  meta: {
    name: "Prose",
    icon: PROSE_ICON,
    description:
      "Long-form text written in Markdown, with headings, callouts, code and tables.",
    group: "content",
  },
});
