import type { VisibilityState } from "@tanstack/vue-table";
import type { TableViewColumn } from "../../../../composables/table-view/types/column";

/**
 * The visibility a table opens with before the user picks columns: a column
 * declared `isVisible: false`, or listed in the table view's `hiddenColumns`,
 * starts hidden but stays in the column picker.
 */
export const buildInitialColumnVisibility = (
  columns: Pick<TableViewColumn, "id" | "isVisible">[],
  hiddenColumns: string[] = [],
): VisibilityState => {
  const hidden = new Set(hiddenColumns);
  return Object.fromEntries(
    columns.map((column) => [
      column.id,
      hidden.has(column.id) ? false : (column.isVisible ?? true),
    ]),
  );
};
