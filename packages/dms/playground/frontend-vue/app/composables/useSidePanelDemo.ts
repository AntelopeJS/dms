/** Id shared by the demo's side panel, its header action and its body. */
export const SIDE_PANEL_DEMO_ID = "demo:side-panel";

/** The open state of the demo side panel, owned by the DMS. */
export function useSidePanelDemo(): ReturnType<typeof useSidePanel> {
  return useSidePanel(SIDE_PANEL_DEMO_ID);
}
