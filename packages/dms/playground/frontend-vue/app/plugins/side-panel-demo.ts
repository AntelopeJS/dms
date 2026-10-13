import { SIDE_PANEL_DEMO_ID } from "../composables/useSidePanelDemo";

const SIDE_PANEL_DEMO_ICON = "i-ph-sidebar-simple-light";
const SIDE_PANEL_DEMO_ORDER = 90;
const SIDE_PANEL_DEMO_DEFAULT_WIDTH = 400;
const SIDE_PANEL_DEMO_MIN_WIDTH = 320;
const SIDE_PANEL_DEMO_MAX_WIDTH = 640;

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
    defaultWidth: SIDE_PANEL_DEMO_DEFAULT_WIDTH,
    minWidth: SIDE_PANEL_DEMO_MIN_WIDTH,
    maxWidth: SIDE_PANEL_DEMO_MAX_WIDTH,
  });

  registerHeaderAction({
    id: SIDE_PANEL_DEMO_ID,
    icon: SIDE_PANEL_DEMO_ICON,
    label: "$demo.side_panel.toggle",
    order: SIDE_PANEL_DEMO_ORDER,
    sidePanelId: SIDE_PANEL_DEMO_ID,
  });
});
