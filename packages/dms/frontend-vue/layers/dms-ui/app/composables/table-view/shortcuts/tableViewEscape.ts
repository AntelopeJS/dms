import type { ShallowRef } from "vue";
import type { RowSelectionState } from "@tanstack/vue-table";

export const TABLE_VIEW_ESCAPE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.escape"],
  descriptionKey: "$dms.shortcuts.tableview.escape.description",
  component: "$dms.components.tableview",
};

export function createTableViewEscapeShortcut(
  globalFilter: ShallowRef<string | undefined>,
  rowSelect: Ref<RowSelectionState>,
) {
  return () => {
    if (
      globalFilter.value === undefined &&
      Object.keys(rowSelect.value).length
    ) {
      rowSelect.value = {};
      return;
    }
    globalFilter.value = undefined;
  };
}
