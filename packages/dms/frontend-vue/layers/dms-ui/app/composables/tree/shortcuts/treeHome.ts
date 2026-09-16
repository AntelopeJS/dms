export const TREE_HOME_METADATA: ShortcutMetadata = {
  key: ["$keyboard.home"],
  descriptionKey: "$dms.shortcuts.tree.home.description",
  component: "$dms.components.tree",
};

export function createTreeHomeShortcut(
  navigateTree: (direction: TreeNavigationDirection) => void,
) {
  return () => navigateTree(TreeNavigationDirection.HOME);
}
