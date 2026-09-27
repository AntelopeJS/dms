import { computed, type ComputedRef } from "vue";
import {
  TREE_ARROW_DOWN_METADATA,
  createTreeArrowDownShortcut,
} from "./treeArrowDown";
import {
  TREE_ARROW_UP_METADATA,
  createTreeArrowUpShortcut,
} from "./treeArrowUp";
import { TREE_ENTER_METADATA, createTreeEnterShortcut } from "./treeEnter";
import { TREE_SPACE_METADATA, createTreeSpaceShortcut } from "./treeSpace";
import { TREE_HOME_METADATA, createTreeHomeShortcut } from "./treeHome";
import { TREE_END_METADATA, createTreeEndShortcut } from "./treeEnd";
import { TREE_SHIFT_A_METADATA, createTreeShiftAShortcut } from "./treeShiftA";
import {
  TREE_ESCAPE_METADATA,
  createTreeEscapeShortcut,
  isTreeEscapeActive,
} from "./treeEscape";

export const TREE_SHORTCUTS_METADATA = [
  TREE_ARROW_DOWN_METADATA,
  TREE_ARROW_UP_METADATA,
  TREE_ENTER_METADATA,
  TREE_SPACE_METADATA,
  TREE_HOME_METADATA,
  TREE_END_METADATA,
  TREE_SHIFT_A_METADATA,
  TREE_ESCAPE_METADATA,
];

interface BuildTreeShortcutsParams {
  navigateTree: (direction: TreeNavigationDirection) => void;
  props: TreeProps;
  items: ComputedRef<TreeNode[]>;
  selected: Ref<TreeNode | TreeNode[] | undefined>;
  activeElement: Ref<Element | null | undefined>;
}

type TreeShortcuts = Record<string, (() => void) | undefined>;

export function buildTreeShortcuts({
  navigateTree,
  props,
  items,
  selected,
  activeElement,
}: BuildTreeShortcutsParams): ComputedRef<TreeShortcuts> {
  const shortcuts = {
    arrowdown: createTreeArrowDownShortcut(navigateTree),
    arrowup: createTreeArrowUpShortcut(navigateTree),
    enter: createTreeEnterShortcut(navigateTree),
    space: createTreeSpaceShortcut(navigateTree),
    home: createTreeHomeShortcut(navigateTree),
    end: createTreeEndShortcut(navigateTree),
    shift_a: createTreeShiftAShortcut(props, items, selected),
  };
  const escape = createTreeEscapeShortcut(props, selected);
  // An unregistered key is left untouched by `defineShortcuts`, so Escape
  // reaches overlays whenever the tree has nothing to clear.
  return computed(() => ({
    ...shortcuts,
    escape: isTreeEscapeActive(selected, activeElement) ? escape : undefined,
  }));
}
