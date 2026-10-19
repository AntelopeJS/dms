import type { TableFilter } from "../../../components/table/Table.vue";

interface FilterColumn {
  value: string;
  label: string;
  type?: DataTypeConfig;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// `{{now}}`, `{{now-7d}}`, `{{now+14d}}`: the tokens the server resolves in a
// filter value (`filter-tokens.ts`), read here with the same rule.
const NOW_TOKEN = /\{\{\s*now(?:\s*([+-])\s*(\d+)d)?\s*\}\}/g;
const BETWEEN_MODE = "is_between";
const BETWEEN_SEPARATOR = ",";

/** A filter value with its `{{now±Nd}}` tokens replaced by that instant. */
export function resolveNowTokens(value: string, now = Date.now()): string {
  return value.replace(NOW_TOKEN, (_match, sign?: string, days?: string) => {
    const offset = sign ? Number(`${sign}${days}`) * DAY_MS : 0;
    return new Date(now + offset).toISOString();
  });
}

/**
 * The value as the formatters read it: tokens resolved, and an `is_between`
 * bound pair written as text (`a,b`, the way the query sends it) split.
 */
const readableValue = (filter: TableFilter): unknown => {
  if (typeof filter.value !== "string") return filter.value;
  const value = resolveNowTokens(filter.value);
  if (filter.mode !== BETWEEN_MODE) return value;
  return value.split(BETWEEN_SEPARATOR).map((bound) => bound.trim());
};

export function formatFilterValue(
  filter: TableFilter,
  columns: FilterColumn[],
  getDataType: (id: string) => DataType | undefined,
  locale: string,
): string {
  if (!filter.value) return String(filter.value ?? "");

  const column = columns.find((col) => col.value === filter.accessorKey);
  if (!column || !column.type) return String(filter.value);

  const dataType = getDataType(column.type.id);
  if (!dataType?.formatter) return String(filter.value);

  const formatter =
    dataType.formatter[filter.mode] || dataType.formatter.default;

  try {
    const result = formatter(readableValue(filter), locale);
    return typeof result === "string" ? result : String(filter.value);
  } catch {
    return String(filter.value);
  }
}
