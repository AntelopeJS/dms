import { GLOBAL_SHORTCUTS_METADATA } from "../build/composables/global/shortcuts";
import { TAB_SHORTCUTS_METADATA } from "../composables/tab/shortcuts";
import { TABLE_VIEW_SHORTCUTS_METADATA } from "../composables/table-view/shortcuts";
import type { ComponentShortcuts } from "../types/shortcuts";

export default [
  {
    component: "Global",
    shortcuts: GLOBAL_SHORTCUTS_METADATA,
  },
  {
    component: "Tab",
    shortcuts: TAB_SHORTCUTS_METADATA,
  },
  {
    component: "TableView",
    shortcuts: TABLE_VIEW_SHORTCUTS_METADATA,
  },
] satisfies ComponentShortcuts[];
