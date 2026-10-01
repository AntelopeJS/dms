import type { TableViewColumn } from "../../../../composables/table-view/types/column";
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
  mode: string;
  items: QuickFilterItem[];
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
const ARRAY_MODE = "array_contains_string";
const SCALAR_MODE = "is";

const inputOptions = (column: TableViewColumn | undefined) =>
  (column?.type?.inputComponent?.options ?? {}) as ColumnInputOptions;

/**
 * The compare mode a quick filter applies: the declared one, else "contains"
 * for a multiple select or relation (the row holds a list) and equality
 * otherwise.
 */
export function quickFilterMode(
  column: TableViewColumn | undefined,
  declared?: string,
): string {
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

/** The hidden filters the picked quick filter values apply. */
export function quickFilterFilters(
  filters: Pick<ResolvedQuickFilter, "field" | "mode">[],
  values: Record<string, string | undefined>,
): TableFilter[] {
  return filters.flatMap(({ field, mode }) => {
    const value = values[field];
    return value === undefined || value === ""
      ? []
      : [{ accessorKey: field, mode, value }];
  });
}
