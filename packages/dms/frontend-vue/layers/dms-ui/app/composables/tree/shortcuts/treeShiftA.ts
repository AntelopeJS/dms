export const TREE_SHIFT_A_METADATA: ShortcutMetadata = {
  key: ["$keyboard.shift", "a"],
  descriptionKey: "$dms.shortcuts.tree.shift_a.description",
  component: "$dms.components.tree",
  condition: {
    descriptionKey: "$dms.shortcuts.tree.shift_a.condition",
    check: "multiple",
  },
};

const selectAllNodes = (nodes: TreeNode[]): TreeNode[] => {
  const result: TreeNode[] = [];
  nodes.forEach((node) => {
    result.push(node);
    if (node.children) {
      result.push(...selectAllNodes(node.children));
    }
  });
  return result;
};

export function createTreeShiftAShortcut(
  props: TreeProps,
  items: ComputedRef<TreeNode[]>,
  selected: Ref<TreeNode | TreeNode[] | undefined>,
) {
  return () => {
    if (props.multiple && items.value.length > 0) {
      selected.value = selectAllNodes(items.value) as TreeNode[];
    }
  };
}
