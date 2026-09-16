import { TAB_SHORTCUTS_METADATA } from "../composables/tab/shortcuts";
import { TABLE_VIEW_SHORTCUTS_METADATA } from "../composables/table-view/shortcuts";
import { TREE_SHORTCUTS_METADATA } from "../composables/tree/shortcuts";
import type { ComponentShortcuts } from "../types/shortcuts";

export default [
  {
    component: "Tab",
    shortcuts: TAB_SHORTCUTS_METADATA,
  },
  {
    component: "TableView",
    shortcuts: TABLE_VIEW_SHORTCUTS_METADATA,
  },
  {
    component: "Tree",
    shortcuts: TREE_SHORTCUTS_METADATA,
  },
] satisfies ComponentShortcuts[];
