import { h } from "vue";
import DmsInstantSaveBadge from "#dms-ui/app/components/save-bar/InstantSaveBadge.vue";
import type { SaveStatusState } from "#dms-ui/app/components/save-bar/SaveStatus.vue";
import { usePageHeaderActions } from "./usePageHeaderActions";

export { combineSaveStates } from "#dms-ui/app/build/composables/instant-save/useInstantSave";

/**
 * Puts the "Saved instantly" pill in the page header. Every page (or section
 * owning the page) whose changes save on their own, with no save bar, calls
 * it, so the pill reads and looks the same everywhere. A page with a save bar
 * never does.
 *
 * @param state Optional save activity, for the pill's "just saved" flash
 */
export const useInstantSaveHeader = (state?: () => SaveStatusState): void => {
  usePageHeaderActions(() =>
    h(DmsInstantSaveBadge, { state: state?.() ?? "idle" }),
  );
};
