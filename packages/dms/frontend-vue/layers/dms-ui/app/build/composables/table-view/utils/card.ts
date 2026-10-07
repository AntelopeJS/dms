import { get } from "@nuxt/ui/runtime/utils/index.js";
import type {
  TableViewCardProps,
  TableViewDisplayContext,
} from "../../../../composables/table-view/types/display";
import type { TableViewColumn } from "../../../../composables/table-view/types/column";

// The columns a card shows when its table declares no `card.fields`.
const FALLBACK_CARD_FIELD_COUNT = 4;

/** What a card shows already, so its fields leave it out. */
export interface CardShownKeys {
  /** The card's title. */
  labelKey?: string;
  rowIdKey: string;
  /** Shown another way: the column a kanban card sits in. */
  others?: string[];
}

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

/**
 * The columns a card shows below its title, on the cards grid and the kanban
 * board alike: the declared `card.fields`, else the first listable columns
 * besides what the card shows already.
 */
export function cardFieldColumns(
  columns: TableViewColumn[],
  declared: string[] | undefined,
  shown: CardShownKeys,
): TableViewColumn[] {
  if (declared) {
    return declared
      .map((key) => columns.find((column) => column.accessorKey === key))
      .filter((column): column is TableViewColumn => !!column);
  }
  const skipped = new Set([
    shown.labelKey,
    shown.rowIdKey,
    ...(shown.others ?? []),
  ]);
  return columns
    .filter(
      (column) =>
        column.listable !== false && !skipped.has(column.accessorKey),
    )
    .slice(0, FALLBACK_CARD_FIELD_COUNT);
}
