import { shallowRef } from "vue";
import {
  previewNavigateMessage,
  type PreviewNavigation,
} from "../../utils/blockPreviewMessages";

/**
 * The sidebar the last `render` asked the preview to draw, read by the
 * preview's layout. Only ever written in the browser, from a message.
 */
export const previewNavigation = shallowRef<PreviewNavigation>();

/** Marks the sidebar, whose clicks reach it even while inspecting. */
export const PREVIEW_NAVIGATION_ATTRIBUTE = "data-dms-preview-navigation";

/** Marks the element holding the sidebar and the blocks, whose height the preview reports. */
export const PREVIEW_FRAME_ATTRIBUTE = "data-dms-preview-frame";

/** Tells the embedding page the sidebar entry `id` was picked. */
export function requestPreviewPage(id: string): void {
  if (window.parent === window) return;
  window.parent.postMessage(previewNavigateMessage(id), "*");
}
