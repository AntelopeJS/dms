export const TREE_ENTER_METADATA: ShortcutMetadata = {
  key: ["$keyboard.enter"],
  descriptionKey: "$dms.shortcuts.tree.enter.description",
  component: "$dms.components.tree",
};

export function createTreeEnterShortcut(
  navigateTree: (direction: TreeNavigationDirection) => void,
) {
  return () => navigateTree(TreeNavigationDirection.SELECT);
}
