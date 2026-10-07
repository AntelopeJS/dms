import type {
  TableViewDisplayContext,
  TableViewExpandedRowProps,
} from "../../../../composables/table-view/types/display";
import { cardRowId } from "./card";

/** The props a custom detail band receives for `item`. */
export function buildExpandedRowProps<T>(
  item: T,
  context: Pick<
    TableViewDisplayContext<T>,
    "columns" | "labelKey" | "rowIdKey" | "actions" | "refresh"
  >,
): TableViewExpandedRowProps<T> {
  return {
    row: item,
    rowId: cardRowId(item, context.rowIdKey),
    columns: context.columns,
    labelKey: context.labelKey,
    actions: context.actions,
    open: () => context.actions.open(item),
    refresh: context.refresh,
  };
}
