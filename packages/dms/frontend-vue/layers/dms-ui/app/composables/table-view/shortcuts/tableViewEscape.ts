import type { ShallowRef } from "vue";
import type { RowSelectionState } from "@tanstack/vue-table";
import { isFocusInsideOverlay } from "../../../utils/overlayFocus";

export const TABLE_VIEW_ESCAPE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.escape"],
  descriptionKey: "$dms.shortcuts.tableview.escape.description",
  component: "$dms.components.tableview",
  condition: {
    descriptionKey: "$dms.shortcuts.tableview.escape.condition",
  },
};

/**
 * Nuxt UI's `defineShortcuts` calls `preventDefault()` on every key it
 * handles, and reka-ui's DismissableLayer ignores a prevented Escape. The
 * shortcut is therefore only registered when there is a search or a
 * selection to clear, and never while focus sits inside an overlay, so the
 * overlay above the table keeps closing on Escape.
 */
export function isTableViewEscapeActive(
  globalFilter: ShallowRef<string | undefined>,
  rowSelect: Ref<RowSelectionState>,
  activeElement: Ref<Element | null | undefined>,
): boolean {
  if (isFocusInsideOverlay(activeElement.value)) return false;
  return (
    globalFilter.value !== undefined || Object.keys(rowSelect.value).length > 0
  );
}

export function createTableViewEscapeShortcut(
  globalFilter: ShallowRef<string | undefined>,
  rowSelect: Ref<RowSelectionState>,
) {
  return () => {
    if (
      globalFilter.value === undefined &&
      Object.keys(rowSelect.value).length
    ) {
      rowSelect.value = {};
      return;
    }
    globalFilter.value = undefined;
  };
}
