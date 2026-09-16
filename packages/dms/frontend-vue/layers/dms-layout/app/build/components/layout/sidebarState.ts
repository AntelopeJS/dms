import type { Ref } from "vue";

interface SidebarState {
  open: Ref<boolean>;
  collapsed: Ref<boolean>;
}

const SIDEBAR_OPEN_STATE_KEY = "dms-sidebar-open";
const SIDEBAR_COLLAPSED_STATE_KEY = "dms-sidebar-collapsed";

/** Returns the sidebar state shared by the current application. */
export function useSidebarState(): SidebarState {
  return {
    open: useDmsState(SIDEBAR_OPEN_STATE_KEY, () => false),
    collapsed: useDmsState(SIDEBAR_COLLAPSED_STATE_KEY, () => false),
  };
}
