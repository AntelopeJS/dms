import { SIDE_PANEL_DEMO_ID } from "../composables/useSidePanelDemo";

const SIDE_PANEL_DEMO_ICON = "i-ph-sidebar-simple-light";
const SIDE_PANEL_DEMO_ORDER = 90;

/**
 * Demo of a docked side panel (see `registerSidePanel`), toggled from a header
 * action linked to it by `sidePanelId`. Both registrations are plain data, so
 * this is a universal plugin: the server renders the button's state and, when
 * the panel was left open, the panel itself. The DMS owns the open state; the
 * panel's own close button calls `useSidePanel(id).close`.
 */
export default defineDmsPlugin(() => {
  registerSidePanel({
    id: SIDE_PANEL_DEMO_ID,
    component: "SidePanelDemo",
    ariaLabel: "$demo.side_panel.title",
  });

  registerHeaderAction({
    id: SIDE_PANEL_DEMO_ID,
    icon: SIDE_PANEL_DEMO_ICON,
    label: "$demo.side_panel.toggle",
    order: SIDE_PANEL_DEMO_ORDER,
    sidePanelId: SIDE_PANEL_DEMO_ID,
  });
});
