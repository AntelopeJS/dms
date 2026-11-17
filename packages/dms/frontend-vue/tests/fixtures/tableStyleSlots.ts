import type { TableStyleSlots } from "../../layers/dms-ui/app/entries/composables/table/useTableColumns";

const noStyle = () => "";

/** Style slots that add no class, for a table whose styling the test does not read. */
export const TABLE_STYLE_SLOTS: TableStyleSlots = {
  headCellInternal: noStyle,
  rowAction: noStyle,
  rowSelection: noStyle,
  colOptionsTrigger: noStyle,
  columnActiveSortIcon: noStyle,
};
