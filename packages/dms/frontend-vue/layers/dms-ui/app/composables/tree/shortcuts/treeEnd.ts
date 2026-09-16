export const TREE_END_METADATA: ShortcutMetadata = {
  key: ["$keyboard.end"],
  descriptionKey: "$dms.shortcuts.tree.end.description",
  component: "$dms.components.tree",
};

export function createTreeEndShortcut(
  navigateTree: (direction: TreeNavigationDirection) => void,
) {
  return () => navigateTree(TreeNavigationDirection.END);
}
