import type { TableViewColumn } from "../../../../composables/table-view/types/column";
import type { TableViewQuickFilterMode } from "../../../../composables/table-view/types/config";
import type { TableFilter } from "../../../components/table/Table.vue";

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

/** Where a relation quick filter reads its values from. */
export interface QuickFilterRelationSource {
  url: string;
  labelKey: string;
  valueKey: string;
}

interface ColumnInputOptions {
  items?: Array<{ value: unknown; label: string }>;
  multiple?: boolean;
  searchUrl?: string;
  keyMapping?: { label?: string; value?: string };
}

const DEFAULT_LABEL_KEY = "name";
const DEFAULT_VALUE_KEY = "_id";
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
 * `undefined` for a column whose values must be fetched (a relation).
 */
export function staticQuickFilterItems(
  column: TableViewColumn | undefined,
  translate: (key: string) => string,
): QuickFilterItem[] | undefined {
  if (!column) return [];
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
  const items = inputOptions(column).items;
  if (items) {
    return items.map((item) => ({
      value: String(item.value),
      label: translate(item.label),
    }));
  }
  return relationQuickFilterSource(column) ? undefined : [];
}

/** The `select` endpoint a relation column picks its rows from. */
export function relationQuickFilterSource(
  column: TableViewColumn | undefined,
): QuickFilterRelationSource | undefined {
  const options = inputOptions(column);
  if (!options.searchUrl) return undefined;
  return {
    url: options.searchUrl,
    labelKey: options.keyMapping?.label ?? DEFAULT_LABEL_KEY,
    valueKey: options.keyMapping?.value ?? DEFAULT_VALUE_KEY,
  };
}

/** Rows of a relation's `select` endpoint as quick filter values. */
export function relationQuickFilterItems(
  rows: Array<Record<string, unknown>>,
  source: QuickFilterRelationSource,
): QuickFilterItem[] {
  return rows.flatMap((row) => {
    const value = row[source.valueKey];
    if (value === undefined || value === null) return [];
    return [
      {
        value: String(value),
        label: String(row[source.labelKey] ?? value),
      },
    ];
  });
}

/** The column filter a quick filter reads and writes. */
const isQuickFilterOf =
  (quickFilter: Pick<ResolvedQuickFilter, "field" | "mode">) =>
  (filter: TableFilter): boolean =>
    filter.accessorKey === quickFilter.field && filter.mode === quickFilter.mode;

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
