import type {
  TableRowActionOptions,
  Data,
} from "../../../build/components/table/Table.vue";
import type { RowSelectionState } from "@tanstack/vue-table";
import { get } from "@nuxt/ui/runtime/utils/index.js";

const DEFAULT_ROW_ID_KEY = "_id";

export const TABLE_VIEW_SHIFT_A_METADATA: ShortcutMetadata = {
  key: ["$keyboard.shift", "a"],
  descriptionKey: "$dms.shortcuts.tableview.shift_a.description",
  component: "$dms.components.tableview",
  condition: {
    descriptionKey: "$dms.shortcuts.tableview.shift_a.condition",
    check: "rowActions.hasSelection",
  },
};

export function createTableViewShiftAShortcut<T extends Data>(
  tableProps: ComputedRef<{
    rowActions?: TableRowActionOptions;
    rowIdKey?: string;
  }>,
  data: Ref<{ results: T[] } | null | undefined>,
  rowSelect: Ref<RowSelectionState>,
) {
  return () => {
    if (tableProps.value.rowActions?.hasSelection && data.value?.results) {
      const rowIdKey = tableProps.value.rowIdKey ?? DEFAULT_ROW_ID_KEY;
      const newSelection: RowSelectionState = {};
      data.value.results.forEach((row: T) => {
        const id = get(row, rowIdKey);
        if (id) {
          newSelection[id] = true;
        }
      });
      rowSelect.value = { ...rowSelect.value, ...newSelection };
    }
  };
}
