export const TREE_ARROW_DOWN_METADATA: ShortcutMetadata = {
  key: ["$keyboard.arrowdown"],
  descriptionKey: "$dms.shortcuts.tree.arrowdown.description",
  component: "$dms.components.tree",
};

export function createTreeArrowDownShortcut(
  navigateTree: (direction: TreeNavigationDirection) => void,
) {
  return () => navigateTree(TreeNavigationDirection.DOWN);
}
