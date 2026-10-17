import { get } from "@nuxt/ui/runtime/utils/index.js";
import { h, type VNodeChild } from "vue";
import type { TableViewColumn } from "../../../composables/table-view/types/column";
import type { TableViewCardConfig } from "../../../composables/table-view/types/display";
import { useColumnValueRenderer } from "../data-types/useColumnValueRenderer";

const IDENTITY_DISPLAY_ID = "identity";

type Row = Record<string, unknown>;

/**
 * The column a card's header draws its title through, if any: the label
 * column's own display, with the card's `imageField` and `subtitleField` read
 * as an `identity` display's `avatarField` and `subtitleField` (which the
 * label column's `identity` display gives when the card sets neither).
 * Without one, the header draws the title next to its initials.
 */
export function cardHeaderColumn(
  columns: TableViewColumn[],
  labelKey: string | undefined,
  card: TableViewCardConfig | undefined,
): TableViewColumn | undefined {
  const label = columns.find((column) => column.accessorKey === labelKey);
  const display = label?.display;
  const hasCardLook = !!(card?.imageField || card?.subtitleField);
  if (!hasCardLook) return display ? label : undefined;
  const identityOptions =
    display?.type === IDENTITY_DISPLAY_ID ? display.options : undefined;
  return {
    ...(label ?? { id: labelKey ?? "", header: "" }),
    accessorKey: labelKey ?? "",
    display: {
      type: IDENTITY_DISPLAY_ID,
      options: {
        ...identityOptions,
        avatarField: card?.imageField ?? identityOptions?.avatarField,
        subtitleField: card?.subtitleField ?? identityOptions?.subtitleField,
      },
    },
  } as TableViewColumn;
}

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

  return { renderField, renderColumnValue };
}
