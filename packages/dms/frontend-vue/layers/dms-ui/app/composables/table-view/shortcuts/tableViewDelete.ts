import type { TableRowActionOptions } from "../../../build/components/table/Table.vue";

export const TABLE_VIEW_DELETE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.delete"],
  descriptionKey: "$dms.shortcuts.tableview.delete.description",
  component: "$dms.components.tableview",
  condition: {
    descriptionKey: "$dms.shortcuts.tableview.delete.condition",
    check: "rowActions.delete",
  },
};

export function createTableViewDeleteShortcut(
  hoveredRowId: Ref<string | null>,
  rowActions: TableRowActionOptions | undefined,
  onDelete: (ids: string[]) => void,
) {
  return () => {
    if (hoveredRowId.value && isActionEnabled(rowActions?.delete)) {
      onDelete([hoveredRowId.value]);
    }
  };
}
