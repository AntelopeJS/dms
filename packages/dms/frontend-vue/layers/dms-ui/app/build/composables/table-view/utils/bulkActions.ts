import type {
  ConfirmColor,
  ConfirmNotice,
} from "../../../../composables/confirm/types";
import { isNumber, isObject } from "#dms-core/app/utils/type-check";

/** A table's row selection, by row id (TanStack `RowSelectionState`). */
export type RowSelectionMap = Record<string, boolean>;

/** The ids of the selected rows, every page included. */
export function selectedRowIds(selection: RowSelectionMap): string[] {
  return Object.keys(selection).filter((id) => selection[id]);
}

/**
 * The query of a bulk request: the ids go as one repeated key
 * (`?ids=a&ids=b`), which the data routes read in full.
 */
export function bulkActionQuery(queryKey: string, ids: string[]) {
  return { [queryKey]: [...ids] };
}

/** The bulk actions that ask before running. */
export type ConfirmedBulkAction = "delete" | "deletePermanently" | "archive";

/**
 * Tone of each confirmation: archiving can be undone (warning), deleting
 * cannot (error), from the archive or from the list alike.
 */
export const BULK_CONFIRM_TONES: Record<ConfirmedBulkAction, ConfirmColor> = {
  delete: "error",
  deletePermanently: "error",
  archive: "warning",
};

const BULK_CONFIRM_ICONS: Record<ConfirmedBulkAction, string> = {
  delete: "i-ph-trash",
  deletePermanently: "i-ph-trash",
  archive: "i-ph-archive",
};

const BULK_CONFIRM_KEYS: Record<ConfirmedBulkAction, string> = {
  delete: "delete",
  deletePermanently: "delete_permanently",
  archive: "archive",
};

/** vue-i18n's `t(key, named, plural)`. */
export type PluralTranslate = (
  key: string,
  named: { count: number } | { failed: number; total: number },
  plural: number,
) => string;

/** What the confirmation of a bulk action says, and in which tone. */
export interface BulkActionConfirm {
  title: string;
  description: string;
  confirmLabel: string;
  color: ConfirmColor;
  icon: string;
}

/**
 * The confirmation of `action` over `count` rows: its texts name how many rows
 * it reaches, in the singular or the plural.
 */
export function bulkActionConfirm(
  action: ConfirmedBulkAction,
  count: number,
  t: PluralTranslate,
): BulkActionConfirm {
  const prefix = `dms.table.${BULK_CONFIRM_KEYS[action]}_confirm`;
  return {
    title: t(`${prefix}_title`, { count }, count),
    description: t(`${prefix}_description`, { count }, count),
    confirmLabel: t(`${prefix}_button`, { count }, count),
    color: BULK_CONFIRM_TONES[action],
    icon: BULK_CONFIRM_ICONS[action],
  };
}

/** What a bulk request reached: the rows it changed and the ones it left. */
export interface BulkActionOutcome {
  processed: number;
  skipped: number;
}

const COUNT_KEYS = [
  "count",
  "deleted",
  "archivedCount",
  "restoredCount",
] as const;

/**
 * The number of rows a bulk route says it changed: a bare number or one of
 * its count keys, `undefined` when it does not say.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Bulk endpoints have heterogeneous response contracts and callers also pass malformed values. No single response owner can narrow this parser without excluding its undefined-result cases.
export const readBulkCount = (response: unknown): number | undefined => {
  if (isNumber(response)) return response;
  if (!response || !isObject(response)) return undefined;
  for (const key of COUNT_KEYS) {
    const value = response[key];
    if (isNumber(value)) return value;
  }
  return undefined;
};

/**
 * How many of the requested rows a bulk route changed. Rows a row rule
 * rejects (or that no longer exist) are left out by the server: they are the
 * skipped ones. A response without a count is taken as a full success.
 */
export function bulkActionOutcome(
  response: Parameters<typeof readBulkCount>[0],
  requested: number,
): BulkActionOutcome {
  const count = readBulkCount(response);
  const processed =
    count === undefined ? requested : Math.min(Math.max(count, 0), requested);
  return { processed, skipped: requested - processed };
}

/** The bulk routes whose outcome counts the rows they reached. */
export type BulkActionKind = "delete" | "archive" | "restore";

/**
 * What a bulk action says when rows were left out (a row rule refused them,
 * or they were already gone): how many of the selection, and why. Undefined
 * when every row went through. The server gives no reason per row, so the
 * reason is the one rows are skipped for.
 */
export function bulkActionShortfall(
  action: BulkActionKind,
  outcome: BulkActionOutcome,
  t: PluralTranslate,
): ConfirmNotice | undefined {
  const { processed, skipped } = outcome;
  if (skipped === 0) return undefined;
  return {
    title:
      processed === 0
        ? t(`dms.table.bulk_refused.${action}`, { count: skipped }, skipped)
        : t(
            `dms.table.bulk_partial.${action}`,
            { failed: skipped, total: processed + skipped },
            skipped,
          ),
    description: t(
      "dms.table.bulk_refused_reason",
      { count: skipped },
      skipped,
    ),
  };
}
