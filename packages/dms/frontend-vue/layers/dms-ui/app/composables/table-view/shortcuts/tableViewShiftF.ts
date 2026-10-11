/**
 * The key a table view opens its search with when its `searchShortcut`
 * names none.
 */
export const DEFAULT_TABLE_SEARCH_SHORTCUT = "shift_f";

export const TABLE_VIEW_SHIFT_F_METADATA: ShortcutMetadata = {
  key: ["$keyboard.shift", "f"],
  descriptionKey: "$dms.shortcuts.tableview.shift_f.description",
  component: "$dms.components.tableview",
  condition: {
    descriptionKey: "$dms.shortcuts.tableview.shift_f.condition",
  },
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

/**
 * The `defineShortcuts` map opening a table's search on `key`, ⇧F when the
 * table names none.
 */
export function tableSearchShortcuts(
  key: string | undefined,
  openSearch: () => void,
): Record<string, () => void> {
  return { [key || DEFAULT_TABLE_SEARCH_SHORTCUT]: openSearch };
}
