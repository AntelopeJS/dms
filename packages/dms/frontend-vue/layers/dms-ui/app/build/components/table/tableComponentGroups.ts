import type { Row, Table } from "@tanstack/vue-table";
import { computed, ref, type VNodeChild } from "vue";
import type { Data, TableProps } from "./Table.types";
import { groupRows } from "../../composables/table-view/utils/groupedRows";

type TableRow<T> = Row<T>;

/** A line of the table body: a row, or the header of the group it opens. */
interface BodyEntry<T> {
  kind: "row" | "group";
  id: string;
  /** The row, or the first row of the group a header opens. */
  row: TableRow<T>;
  /** Group key, on a group header. */
  key?: string;
  /**
   * Draws a group header with the grouping it was listed under: a header
   * still rendering once the grouping is gone reads it, not the prop.
   */
  header?: () => VNodeChild;
}

export function useTableComponentGroups<T extends Data>(
  props: TableProps<T>,
  table: Table<T>,
) {
  const GROUP_ENTRY_PREFIX = "group:";
  const collapsedGroups = ref<string[]>([]);
  const toggleGroup = (key: string) => {
    collapsedGroups.value = collapsedGroups.value.includes(key)
      ? collapsedGroups.value.filter((collapsed) => collapsed !== key)
      : [...collapsedGroups.value, key];
  };

  const bodyEntries = computed<BodyEntry<T>[]>(() => {
    const rows = table.getRowModel().rows;
    const grouping = props.grouping;
    if (!grouping) return rows.map((row) => ({ kind: "row", id: row.id, row }));
    const entries: BodyEntry<T>[] = [];
    for (const group of groupRows(rows, (row) =>
      grouping.keyOf(row.original),
    )) {
      const { key } = group;
      const [first] = group.rows;
      entries.push({
        kind: "group",
        id: GROUP_ENTRY_PREFIX + key,
        row: first,
        key,
        header: () => grouping.header(key, first.original),
      });
      if (collapsedGroups.value.includes(key)) continue;
      for (const row of group.rows) {
        entries.push({ kind: "row", id: row.id, row });
      }
    }
    return entries;
  });
  return { bodyEntries, collapsedGroups, toggleGroup };
}
