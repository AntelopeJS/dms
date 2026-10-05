import { get } from "@nuxt/ui/runtime/utils/index.js";
import type {
  TableViewCardProps,
  TableViewDisplayContext,
} from "../../../../composables/table-view/types/display";

/** The id of a row, read with the table's `rowIdKey`. */
export function cardRowId<T>(item: T, rowIdKey: string): string {
  return String(get(item as Record<string, unknown>, rowIdKey) ?? "");
}

/**
 * The props a custom card receives for `item`, the same whichever display
 * draws it.
 */
export function buildCardProps<T>(
  item: T,
  context: Pick<
    TableViewDisplayContext<T>,
    "columns" | "labelKey" | "rowIdKey" | "actions" | "selection"
  >,
): TableViewCardProps<T> {
  const rowId = cardRowId(item, context.rowIdKey);
  return {
    row: item,
    rowId,
    columns: context.columns,
    labelKey: context.labelKey,
    actions: context.actions,
    selected: context.selection.isSelected(rowId),
    select: (value?: boolean) => context.selection.toggle(rowId, value),
    open: () => context.actions.open(item),
  };
}
