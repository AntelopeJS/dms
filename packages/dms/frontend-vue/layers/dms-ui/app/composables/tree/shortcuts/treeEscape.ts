export const TREE_ESCAPE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.escape"],
  descriptionKey: "$dms.shortcuts.tree.escape.description",
  component: "$dms.components.tree",
};

export function createTreeEscapeShortcut(
  props: TreeProps,
  selected: Ref<TreeNode | TreeNode[] | undefined>,
) {
  return () => {
    selected.value = props.multiple ? [] : undefined;
  };
}
