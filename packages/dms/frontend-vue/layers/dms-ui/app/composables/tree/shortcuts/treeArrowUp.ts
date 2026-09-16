export const TREE_ARROW_UP_METADATA: ShortcutMetadata = {
  key: ["$keyboard.arrowup"],
  descriptionKey: "$dms.shortcuts.tree.arrowup.description",
  component: "$dms.components.tree",
};

export function createTreeArrowUpShortcut(
  navigateTree: (direction: TreeNavigationDirection) => void,
) {
  return () => navigateTree(TreeNavigationDirection.UP);
}
