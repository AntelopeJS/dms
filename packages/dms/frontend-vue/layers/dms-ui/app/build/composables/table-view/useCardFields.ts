import { get } from "@nuxt/ui/runtime/utils/index.js";
import { h, type VNodeChild } from "vue";
import type { TableViewColumn } from "../../../composables/table-view/types/column";
import { useColumnValueRenderer } from "../data-types/useColumnValueRenderer";

type Row = Record<string, unknown>;

/**
 * Draws a row's fields on a card (the cards display, the kanban board) the
 * way the grid draws its cells: through the column's `display`, else its data
 * type, handed the row for what a display reads beside the value (a progress
 * bar's total, a tone, an avatar).
 */
export function useCardFields() {
  const { renderColumnValue } = useColumnValueRenderer();

  const renderField = (column: TableViewColumn, item: Row): VNodeChild => {
    const rendered = renderColumnValue(column, item, "cell");
    if (typeof rendered !== "string" && typeof rendered !== "number") {
      return rendered;
    }
    const value = get(item, column.accessorKey);
    // The fallback of a missing value reads dimmed, as an empty cell does.
    const isMissing = value === null || value === undefined;
    return h(
      "span",
      { class: isMissing ? "text-dimmed truncate" : "truncate" },
      String(rendered),
    );
  };

  return { renderField };
}
