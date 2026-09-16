/**
 * Demo of the sidebar-widget mode. Registers free components that the DMS
 * mounts in the sidebar (see `useSidebarWidgets`). Each one picks its own
 * `position` — the spot no longer follows the `module` scope — and receives
 * the sidebar's `collapsed` state as a prop to adapt to the narrow rail.
 *
 * Registration is serializable (`component` is a plain string), so this is a
 * universal plugin — no `.client` needed, and the sidebar renders during SSR.
 */
export default defineDmsPlugin(() => {
  const { register } = useSidebarWidgets();

  register({
    id: "demo:sidebar",
    component: "SidebarWidgetDemo",
    position: SidebarWidgetPosition.ABOVE_SEARCH_BAR,
    order: 0,
  });

  // Module-scoped variant: only mounted while browsing inside the demo
  // module (`/modules/demo/**`). Registered here at boot like any other
  // widget — the sidebar's render filter is the only gate. Its position is a
  // free choice: below the search button reads as part of the module, above
  // it would read as part of the dashboard chrome.
  register({
    id: "demo:sidebar-module",
    component: "SidebarWidgetModuleDemo",
    position: SidebarWidgetPosition.BELOW_SEARCH_BAR,
    order: 1,
    module: "demo",
  });
});
