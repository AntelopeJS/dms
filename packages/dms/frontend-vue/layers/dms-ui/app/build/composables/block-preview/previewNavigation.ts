import { shallowRef } from "vue";
import {
  previewNavigateMessage,
  previewSectionEditMessage,
  type PreviewHeader,
  type PreviewNavigation,
} from "../../utils/blockPreviewMessages";
import type { MockupSectionEdit } from "../../utils/mockupSections";

/**
 * The sidebar the last `render` asked the preview to draw, read by the
 * preview's layout. Only ever written in the browser, from a message.
 */
export const previewNavigation = shallowRef<PreviewNavigation>();

/**
 * The page header the last `render` asked the preview to draw, read by the
 * preview and its layout. Only ever written in the browser, from a message.
 */
export const previewHeader = shallowRef<PreviewHeader>();

/** Marks the page header, whose click picks the page while inspecting. */
export const PREVIEW_HEADER_ATTRIBUTE = "data-dms-preview-header";

/** Marks the sidebar, whose clicks reach it even while inspecting. */
export const PREVIEW_NAVIGATION_ATTRIBUTE = "data-dms-preview-navigation";

/** Marks the element holding the sidebar and the blocks, whose height the preview reports. */
export const PREVIEW_FRAME_ATTRIBUTE = "data-dms-preview-frame";

/** Tells the embedding page the sidebar entry `id` was picked. */
export function requestPreviewPage(id: string): void {
  if (window.parent === window) return;
  window.parent.postMessage(previewNavigateMessage(id), "*");
}

/** Hands the embedding page a change of the sidebar's sections, which it writes to the spec. */
export function requestSectionEdit(edit: MockupSectionEdit): void {
  if (window.parent === window) return;
  window.parent.postMessage(previewSectionEditMessage(edit), "*");
}
