import type { Ref } from "vue";

/** Id shared by the demo's header action and side panel. */
export const SIDE_PANEL_DEMO_ID = "demo:side-panel";

const SIDE_PANEL_DEMO_OPEN_STATE_KEY = "demo:side-panel-open";

/** Whether the demo side panel is open, shared by its launcher and its body. */
export function useSidePanelDemoOpen(): Ref<boolean> {
  return useDmsState<boolean>(SIDE_PANEL_DEMO_OPEN_STATE_KEY, () => false);
}
