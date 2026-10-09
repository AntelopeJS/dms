import { useAppOverlay } from "../composables/useAppOverlay";

/** Registered name of `SidePanelHost.vue` (the layer's `Dms` prefix applied). */
const SIDE_PANEL_HOST_COMPONENT = "DmsSidePanelHost";

/**
 * Mounts the side panel host as an app overlay, outside the routed layouts, so
 * the open side panel survives a layout change. Universal: the server renders
 * the open panel too.
 */
export default defineDmsPlugin(() => {
  useAppOverlay().register(SIDE_PANEL_HOST_COMPONENT);
});
