import type { Ref } from "vue";
import {
  RESIZE_KEYBOARD_STEP_PX,
  useResizableSize,
} from "#dms-ui/app/build/composables/containers/useResizableSize";
import {
  resolveSidePanelWidthBounds,
  type SidePanel,
  type SidePanelWidthBounds,
} from "../../../composables/useAppSidePanels";
import {
  readSidePanelPreferences,
  storeSidePanelWidth,
  useSidePanelDragWidth,
  useSidePanelPreferences,
} from "./sidePanelState";

/** @internal */
export const SIDE_PANEL_KEYBOARD_STEP_PX = RESIZE_KEYBOARD_STEP_PX;

/** @internal */
export interface SidePanelWidth {
  width: Readonly<Ref<number>>;
  bounds: SidePanelWidthBounds;
  isDragging: Readonly<Ref<boolean>>;
  startDrag: (event: PointerEvent, renderedWidth: number) => void;
  drag: (event: PointerEvent) => void;
  endDrag: () => void;
  resizeFromKey: (event: KeyboardEvent) => void;
  reset: () => void;
}

/**
 * The width of a side panel and the handlers of its resize handle: dragging,
 * the arrow / Home / End keys, and a reset to the default width. The width is
 * kept per panel id in the side panel cookie, written once a change settles;
 * while the handle is dragged, the shared drag width moves the page with it.
 *
 * @internal
 */
export function useSidePanelWidth(panel: SidePanel): SidePanelWidth {
  const bounds = resolveSidePanelWidthBounds(panel);
  const preferences = useSidePanelPreferences();
  const resizable = useResizableSize({
    side: "right",
    bounds: {
      defaultSize: bounds.defaultWidth,
      minSize: bounds.minWidth,
      maxSize: bounds.maxWidth,
    },
    storage: {
      read: () => readSidePanelPreferences(preferences.value).widths[panel.id],
      write: (width) =>
        storeSidePanelWidth(
          preferences,
          panel.id,
          width ?? bounds.defaultWidth,
        ),
    },
    liveSize: useSidePanelDragWidth(),
  });

  return {
    // The panel always has a default width: its size is never natural.
    width: computed(() => resizable.size.value ?? bounds.defaultWidth),
    bounds,
    isDragging: resizable.isDragging,
    startDrag: resizable.startDrag,
    drag: resizable.drag,
    endDrag: resizable.endDrag,
    resizeFromKey: (event) => resizable.resizeFromKey(event),
    reset: resizable.reset,
  };
}
