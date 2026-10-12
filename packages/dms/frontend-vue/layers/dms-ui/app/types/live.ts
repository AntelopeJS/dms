/**
 * Mirror of `PageLivePeriod` from `@antelopejs/interface-dms/page`: whole
 * minutes, hours or days (`"30m"`, `"24h"`, `"7d"`).
 */
export type PageLivePeriod = `${number}${"m" | "h" | "d"}`;

/** Mirror of `PageLiveSlowRate`: the cadence of a page showing a long period. */
export interface PageLiveSlowRate {
  period: PageLivePeriod;
  maxRate: number;
}

/**
 * Mirror of `PageLiveOptions` from `@antelopejs/interface-dms/page`: the
 * Live / Pause valve a page declares with `live`.
 */
export interface PageLiveOptions {
  /** Shortest interval, in seconds, between two refetches of one block. */
  maxRate?: number;
  /** The slower cadence once the page's period spans `period` or more. */
  slowRateAfter?: PageLiveSlowRate;
  /** Key the remembered Live / Pause choice is shared under. */
  rememberKey?: string;
}

/** How the live toggle draws a note: a breakdown in 5xx reads as an error. */
export type PageLiveNoteTone = "neutral" | "warning" | "error";

/**
 * A short text the live toggle shows: why the page holds ("typing in the
 * Tester"), or what its missed events hold ("2 in 5xx"). `text` is an i18n
 * key prefixed with `$`, translated with `params` (pluralised on
 * `params.count` when it is a number), or a text shown as is.
 */
export interface PageLiveNote {
  text: string;
  params?: Record<string, unknown>;
  tone?: PageLiveNoteTone;
}

/** A {@link PageLiveNote}, or its `text` alone. */
export type PageLiveNoteInput = string | PageLiveNote;

/**
 * Mirror of `TableViewLiveHoldOptions` from
 * `@antelopejs/interface-dms/base/table-view`: when a `liveHold` table also
 * holds its rows while its page is live.
 */
export interface TableViewLiveHoldOptions {
  /** While one of its rows is open in the side panel. */
  whileRowOpen?: boolean;
  /** While the user has scrolled its first row out of view. */
  whileScrolled?: boolean;
  /** While the user's search narrows the rows. */
  whileSearching?: boolean;
  /** While the user sorts the rows otherwise than by the table's default. */
  whileSorted?: boolean;
  /** What the strip calls the new rows, given `{count}`. */
  missedLabel?: string;
}
