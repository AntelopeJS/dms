import type { ConfirmColor } from "../../../../composables/confirm/types";

/**
 * Query key naming the table view a write comes from: the server applies that
 * table's permission and row rules (several tables may share a controller's
 * routes, never their rules). Mirrors the backend `TABLE_VIEW_QUERY_KEY`.
 */
export const TABLE_VIEW_QUERY_KEY = "tableView";

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
export function bulkActionQuery(
  queryKey: string,
  ids: string[],
  tableViewKey?: string,
): Record<string, string | string[]> {
  return {
    [queryKey]: [...ids],
    ...(tableViewKey ? { [TABLE_VIEW_QUERY_KEY]: tableViewKey } : {}),
  };
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
  named: Record<string, unknown>,
  plural: number,
) => string;

/** What the confirmation of a bulk action says, and in which tone. */
export interface BulkActionConfirm {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: ConfirmColor;
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
    confirmColor: BULK_CONFIRM_TONES[action],
    icon: BULK_CONFIRM_ICONS[action],
  };
}

/** What a bulk request reached: the rows it changed and the ones it left. */
export interface BulkActionOutcome {
  processed: number;
  skipped: number;
}

// The count each bulk route answers with: delete sends the number of deleted
// rows (or `{ deleted }` when a row rule filtered out every id), archive and
// restore send `{ archivedCount }` / `{ restoredCount }`.
const COUNT_KEYS = ["deleted", "archivedCount", "restoredCount"] as const;

const readCount = (response: unknown): number | undefined => {
  if (typeof response === "number") return response;
  if (!response || typeof response !== "object") return undefined;
  for (const key of COUNT_KEYS) {
    const value = (response as Record<string, unknown>)[key];
    if (typeof value === "number") return value;
  }
  return undefined;
};

/**
 * How many of the requested rows a bulk route changed. Rows a row rule
 * rejects (or that no longer exist) are left out by the server: they are the
 * skipped ones. A response without a count is taken as a full success.
 */
export function bulkActionOutcome(
  response: unknown,
  requested: number,
): BulkActionOutcome {
  const count = readCount(response);
  const processed =
    count === undefined ? requested : Math.min(Math.max(count, 0), requested);
  return { processed, skipped: requested - processed };
}
