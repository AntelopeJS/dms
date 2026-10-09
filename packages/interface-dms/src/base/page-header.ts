import type { RecordText } from "./types/record-text";
import type { Tone } from "./types/tone";

/**
 * Where a page header reads the record it shows: `DefaultLayout({ header })`.
 */
export interface PageHeaderSource {
  /**
   * The route answering a {@link PageHeaderRecord}. `{{params.X}}` is filled
   * with the route parameter `X` of the page URL (`{{params.id}}` on a detail
   * page whose slug is `:id`) and `{{query.X}}` with its query parameter;
   * nothing is requested while a token has no value.
   *
   * Read again, keeping the header on screen, once a header button changed
   * something, and whenever the page asks its blocks to refresh
   * (`BlockFunctions.REFRESH_PAGE`, `refreshPageBlocks()`).
   */
  fetchUrl: string;
}

/** The picture leading a record's header, in place of the page's icon. */
export interface PageHeaderAvatar {
  /** Image URL. */
  src?: string;
  /** Shown in the tile when there is no image ("AC" for Acme Corp). */
  initials?: string;
}

/** The status pill right of a record's title. */
export interface PageHeaderStatus {
  label: RecordText;
  tone?: Tone;
}

/** A badge right of a record's title or status (a plan, "Complimentary"). */
export interface PageHeaderBadge {
  label: RecordText;
  tone?: Tone;
  icon?: string;
}

/**
 * One entry of the meta line under a record's title, entries set apart by
 * "·": `label` muted, then `value` in the default text colour.
 */
export interface PageHeaderMetaItem {
  label?: RecordText;
  value?: RecordText;
  icon?: string;
  /** Colours the entry ("Joined as support" in `success`). */
  tone?: Tone;
  /** Draws `value` in the mono font: an id, a reference. */
  mono?: boolean;
}

/**
 * What the route of `header.fetchUrl` answers: who the record is, and the
 * record its header actions read. Every field is optional; one left out
 * keeps the page's own (its `displayName`, `description` and `icon`) or
 * shows nothing.
 *
 * Texts follow the `$` i18n convention. The title also ends the breadcrumb.
 *
 * @example
 * ```json
 * {
 *   "title": "Acme Corp",
 *   "avatar": { "initials": "AC" },
 *   "status": { "label": "$saas.status.past_due", "tone": "error" },
 *   "badges": [{ "label": "Business" }],
 *   "meta": [
 *     { "value": "ws_8f2c", "mono": true },
 *     { "label": "$saas.wd.owner", "value": "Jane Doe" }
 *   ],
 *   "record": { "status": "past_due", "billed": true, "stripeCustomerId": "cus_1" }
 * }
 * ```
 */
export interface PageHeaderRecord {
  title?: RecordText;
  /** The line under the title, in place of the page's description. */
  subtitle?: RecordText;
  avatar?: PageHeaderAvatar;
  /** Icon of the tile, when there is no `avatar`; defaults to the page's. */
  icon?: string;
  status?: PageHeaderStatus;
  badges?: PageHeaderBadge[];
  meta?: PageHeaderMetaItem[];
  /**
   * The fields the `when` and `unavailableWhen` conditions of the header's
   * actions read, and their targets fill in. Defaults to the whole answer.
   */
  record?: Record<string, unknown>;
}
