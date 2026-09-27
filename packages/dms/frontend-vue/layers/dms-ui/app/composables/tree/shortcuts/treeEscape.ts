import { isFocusInsideOverlay } from "../../../utils/overlayFocus";

export const TREE_ESCAPE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.escape"],
  descriptionKey: "$dms.shortcuts.tree.escape.description",
  component: "$dms.components.tree",
  condition: {
    descriptionKey: "$dms.shortcuts.tree.escape.condition",
  },
};

/**
 * Nuxt UI's `defineShortcuts` calls `preventDefault()` on every key it
 * handles, and reka-ui's DismissableLayer ignores a prevented Escape. The
 * shortcut is therefore only registered when there is a selection to clear,
 * and never while focus sits inside an overlay, so the overlay above the tree
 * keeps closing on Escape.
 */
export function isTreeEscapeActive(
  selected: Ref<TreeNode | TreeNode[] | undefined>,
  activeElement: Ref<Element | null | undefined>,
): boolean {
  if (isFocusInsideOverlay(activeElement.value)) return false;
  const value = selected.value;
  return Array.isArray(value) ? value.length > 0 : value != null;
}

export function createTreeEscapeShortcut(
  props: TreeProps,
  selected: Ref<TreeNode | TreeNode[] | undefined>,
) {
  return () => {
    selected.value = props.multiple ? [] : undefined;
  };
}
