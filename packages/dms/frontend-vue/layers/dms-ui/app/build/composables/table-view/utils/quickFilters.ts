import type { TableViewColumn } from "../../../../composables/table-view/types/column";
import type { TableViewQuickFilterMode } from "../../../../composables/table-view/types/config";
import type { TableFilter } from "../../../components/table/Table.vue";
import type {
  DataType,
  DataTypeSelectSource,
} from "#dms-core/app/composables/data-types/useDataType";
import {
  relationRowLabel,
  relationRowValue,
} from "../../data-types/relationRows";

/** A value a quick filter offers. */
export interface QuickFilterItem {
  label: string;
  value: string;
}

/** A quick filter ready for the toolbar. */
export interface ResolvedQuickFilter {
  field: string;
  label: string;
  icon: string;
  allLabel: string;
  mode: TableViewQuickFilterMode;
  items: QuickFilterItem[];
  /** Its values are still loading: the button holds its place, disabled. */
  pending?: boolean;
}

interface ColumnInputOptions {
  items?: Array<{ value: unknown; label: string }>;
  multiple?: boolean;
}

const ARRAY_MODE: TableViewQuickFilterMode = "array_contains_string";
const SCALAR_MODE: TableViewQuickFilterMode = "is";

const inputOptions = (column: TableViewColumn | undefined) =>
  (column?.type?.inputComponent?.options ?? {}) as ColumnInputOptions;

/**
 * The compare mode a quick filter applies: the declared one, else "contains"
 * for a multiple select or relation (the row holds a list) and equality
 * otherwise.
 */
export function quickFilterMode(
  column: TableViewColumn | undefined,
  declared?: TableViewQuickFilterMode,
): TableViewQuickFilterMode {
  if (declared) return declared;
  return inputOptions(column).multiple ? ARRAY_MODE : SCALAR_MODE;
}

/**
 * The values a select or boolean column offers, known from its declaration;
 * `undefined` for a column that declares none (a relation's are fetched).
 */
export function staticQuickFilterItems(
  column: TableViewColumn | undefined,
  translate: (key: string) => string,
): QuickFilterItem[] | undefined {
  if (!column) return undefined;
  const typeId = column.type?.id;
  if (typeId === "boolean" || typeId === "status") {
    return [
      { value: "true", label: translate("$dms.table.filter.boolean.checked") },
      {
        value: "false",
        label: translate("$dms.table.filter.boolean.unchecked"),
      },
    ];
  }
  return inputOptions(column).items?.map((item) => ({
    value: String(item.value),
    label: translate(item.label),
  }));
}

/**
 * Where a relation column's values are read: the `select` route its data
 * type's {@link DataType.selectSource} names, as for its picker and its
 * filter chips.
 */
export function relationQuickFilterSource(
  column: TableViewColumn | undefined,
  getDataType: (id: string) => DataType | undefined,
): DataTypeSelectSource | undefined {
  const typeId = column?.type?.id;
  if (!typeId) return undefined;
  return getDataType(typeId)?.selectSource?.(inputOptions(column));
}

/** Rows of a relation's `select` route as quick filter values. */
export function relationQuickFilterItems(
  rows: Array<Record<string, unknown>>,
  source: DataTypeSelectSource,
): QuickFilterItem[] {
  return rows.flatMap((row) => {
    const value = relationRowValue(source, row);
    if (value === undefined || value === null) return [];
    return [
      {
        value: String(value),
        label: String(relationRowLabel(source, row) ?? value),
      },
    ];
  });
}

/** The column filter a quick filter reads and writes. */
const isQuickFilterOf =
  (quickFilter: Pick<ResolvedQuickFilter, "field" | "mode">) =>
  (filter: TableFilter): boolean =>
    filter.accessorKey === quickFilter.field &&
    filter.mode === quickFilter.mode;

/**
 * The value a quick filter shows as picked: the one its column's filter holds
 * in the table's filter state, whichever control set it.
 */
export function quickFilterValue(
  filters: TableFilter[],
  quickFilter: Pick<ResolvedQuickFilter, "field" | "mode">,
): string | undefined {
  const value = filters.find(isQuickFilterOf(quickFilter))?.value;
  return value === undefined || value === null || value === ""
    ? undefined
    : String(value);
}

/**
 * The table's filters once a quick filter picked `value`, `undefined` for its
 * "All" entry. It writes the column's own filter — the one the filters row
 * shows, the preferences keep and "Reset filters" clears: a default filter on
 * the column takes the value, any other filter on it gives way.
 */
export function applyQuickFilter(
  filters: TableFilter[],
  quickFilter: Pick<ResolvedQuickFilter, "field" | "mode">,
  value: string | undefined,
): TableFilter[] {
  const { field, mode } = quickFilter;
  const pinned = filters.find(
    (filter) => filter.accessorKey === field && filter.pinned,
  );
  if (pinned) {
    return filters.map((filter) =>
      filter === pinned ? { ...filter, mode, value } : filter,
    );
  }
  const others = filters.filter((filter) => filter.accessorKey !== field);
  return value === undefined
    ? others
    : [...others, { accessorKey: field, mode, value, pinned: false }];
}

/**
 * The text of a quick filter's button: its label while nothing is picked,
 * else the picked value's label — preceded by the filter's own label
 * ("Role: Admin") when the table has no filters row to show the chip in.
 */
export function quickFilterButtonLabel(
  quickFilter: ResolvedQuickFilter,
  filters: TableFilter[],
  hasFiltersRow: boolean,
): string {
  const value = quickFilterValue(filters, quickFilter);
  if (value === undefined) return quickFilter.label;
  const picked =
    quickFilter.items.find((item) => item.value === value)?.label ?? value;
  return hasFiltersRow ? picked : `${quickFilter.label}: ${picked}`;
}
