import type { VisibilityState } from "@tanstack/vue-table";
import type { TableViewColumn } from "../../../../composables/table-view/types/column";

/**
 * The visibility a table opens with before the user picks columns: a column
 * declared `isVisible: false` starts hidden but stays in the column picker.
 */
export const buildInitialColumnVisibility = (
  columns: Pick<TableViewColumn, "id" | "isVisible">[],
): VisibilityState =>
  Object.fromEntries(
    columns.map((column) => [column.id, column.isVisible ?? true]),
  );
