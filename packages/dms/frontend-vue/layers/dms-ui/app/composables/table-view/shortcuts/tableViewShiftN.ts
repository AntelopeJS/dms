import type { TableRowActionOptions } from "../../../build/components/table/Table.vue";

export const TABLE_VIEW_SHIFT_N_METADATA: ShortcutMetadata = {
  key: ["$keyboard.shift", "n"],
  descriptionKey: "$dms.shortcuts.tableview.shift_n.description",
  component: "$dms.components.tableview",
  condition: {
    descriptionKey: "$dms.shortcuts.tableview.shift_n.condition",
    check: "rowActions.add",
  },
};

export function createTableViewShiftNShortcut(
  tableProps: ComputedRef<{ rowActions?: TableRowActionOptions }>,
  newRow: () => void,
) {
  return () => {
    if (isActionEnabled(tableProps.value.rowActions?.add)) {
      newRow();
    }
  };
}
