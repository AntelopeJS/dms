export const TABLE_VIEW_SHIFT_F_METADATA: ShortcutMetadata = {
  key: ["$keyboard.shift", "f"],
  descriptionKey: "$dms.shortcuts.tableview.shift_f.description",
  component: "$dms.components.tableview",
};

export function createTableViewShiftFShortcut(
  searchActive: Ref<boolean>,
  globalFilterState: Ref<string | undefined>,
  focusSearchBar: () => void,
) {
  return async () => {
    searchActive.value = true;
    globalFilterState.value = "";
    await nextTick();
    focusSearchBar();
  };
}
