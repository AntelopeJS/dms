export const TABLE_VIEW_META_R_METADATA: ShortcutMetadata = {
  key: ["$keyboard.meta", "r"],
  descriptionKey: "$dms.shortcuts.tableview.meta_r.description",
  component: "$dms.components.tableview",
};

export function createTableViewMetaRShortcut(refresh: () => void) {
  return () => refresh();
}
