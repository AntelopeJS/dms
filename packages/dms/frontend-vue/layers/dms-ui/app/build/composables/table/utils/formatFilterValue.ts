import type { TableFilter } from "../../../components/table/Table.vue";

interface FilterColumn {
  value: string;
  label: string;
  type?: DataTypeConfig;
}

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

  // A filter's value need not have the column's shape (a tag typed against
  // a tags column, whose formatter draws a list): a formatter that writes
  // nothing for it leaves the value as typed.
  try {
    const result = formatter(filter.value, locale);
    return typeof result === "string" && result !== ""
      ? result
      : String(filter.value);
  } catch {
    return String(filter.value);
  }
}
