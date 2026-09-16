export const TREE_SPACE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.space"],
  descriptionKey: "$dms.shortcuts.tree.space.description",
  component: "$dms.components.tree",
};

export function createTreeSpaceShortcut(
  navigateTree: (direction: TreeNavigationDirection) => void,
) {
  return () => navigateTree(TreeNavigationDirection.SELECT);
}
