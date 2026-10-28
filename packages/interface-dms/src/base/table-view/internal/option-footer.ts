/** @internal @packageDocumentation */
import type { RowActionRule } from "../../types/row-action";

/** What a footer summary computes over the rows the table lists. */
export type TableViewSummaryOperation = "sum" | "count";

/**
 * How a footer summary's figure reads, the options of `Intl.NumberFormat`
 * a backend can send. Left out, a sum reads like its column's cells (a
 * price as a price) and a count as a whole number.
 */
export interface TableViewSummaryFormat {
  style?: "decimal" | "percent" | "currency";
  /** ISO 4217 code, for the `currency` style. */
  currency?: string;
  notation?: "standard" | "compact";
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * A figure of the footer band ("MRR €12,480", "3 failed"), computed by the
 * server over every row the table's filters, search and tab list — not only
 * the page shown.
 */
export interface TableViewFooterSummary<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published default accepts module-owned rows.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Shown before the figure. `$`-prefixed: an i18n key. */
  label: string;
  /** Column summed; required by `sum`. */
  field?: string;
  op: TableViewSummaryOperation;
  /**
   * Only the rows this rule accepts are summed or counted ("failed"). It
   * reads the stored fields of a row, in the database.
   */
  where?: RowActionRule<T>;
  format?: TableViewSummaryFormat;
}

/** A footer summary as it reaches the client: `where` stays on the server. */
export interface TableViewFooterSummarySerialized extends Omit<
  TableViewFooterSummary,
  "where"
> {
  /** Id the `summary` route computes it under. */
  id: string;
}

/** Texts and figures of the footer band. */
export interface TableViewFooterOptions<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published default accepts module-owned rows.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Row count text, an i18n key with `$` receiving `{ count }` and pluralized
   * on it ("7 members"). Defaults to "{count} items".
   */
  countLabel?: string;
  /** A hint at the right of the count. `$`-prefixed: an i18n key. */
  hint?: string;
  /**
   * Figures computed over the listed rows, next to the count. The
   * controller mounts `summary: TableViewRoutes.Summary` to serve them.
   */
  summary?: TableViewFooterSummary<T>[];
  /**
   * A `SelectType` column whose items, with their colors, the footer lists
   * as a legend.
   */
  legend?: string;
}

/** The footer band's options as they reach the client. */
export interface TableViewFooterSerialized extends Omit<
  TableViewFooterOptions,
  "summary"
> {
  summary?: TableViewFooterSummarySerialized[];
}
