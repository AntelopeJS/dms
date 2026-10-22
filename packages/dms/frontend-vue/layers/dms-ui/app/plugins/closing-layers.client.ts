import { watchClosingLayers } from "../build/composables/containers/closingLayers";

/**
 * Every dialog the DMS or a module renders lets the page be clicked as soon
 * as it starts closing: one place for UModal, USlideover, UDrawer, the
 * confirm dialogs and DynamicDrawer / DynamicModal alike.
 */
export default defineDmsPlugin(() => {
  watchClosingLayers(document);
});
