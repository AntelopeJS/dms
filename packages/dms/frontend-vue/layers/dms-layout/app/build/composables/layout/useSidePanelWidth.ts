import type { Ref } from "vue";
import {
  resolveSidePanelWidthBounds,
  type SidePanel,
  type SidePanelWidthBounds,
} from "../../../composables/useAppSidePanels";
import {
  clampSidePanelWidth,
  readSidePanelPreferences,
  storedSidePanelWidth,
  storeSidePanelWidth,
  useSidePanelDragWidth,
  useSidePanelPreferences,
} from "./sidePanelState";

/** @internal */
export const SIDE_PANEL_KEYBOARD_STEP_PX = 16;

type WidthStep = (width: number, bounds: SidePanelWidthBounds) => number;

// The panel sits on the right: the arrow pointing away from it widens it.
const KEYBOARD_STEPS: Record<string, WidthStep> = {
  ArrowLeft: (width) => width + SIDE_PANEL_KEYBOARD_STEP_PX,
  ArrowRight: (width) => width - SIDE_PANEL_KEYBOARD_STEP_PX,
  Home: (_, bounds) => bounds.minWidth,
  End: (_, bounds) => bounds.maxWidth,
};

interface DragStart {
  x: number;
  width: number;
}

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
  const dragWidth = useSidePanelDragWidth();
  const width = computed(
    () =>
      dragWidth.value ??
      storedSidePanelWidth(
        readSidePanelPreferences(preferences.value),
        panel.id,
        bounds,
      ),
  );
  let dragStart: DragStart | null = null;

  function commit(next: number): void {
    storeSidePanelWidth(
      preferences,
      panel.id,
      clampSidePanelWidth(next, bounds),
    );
  }

  function startDrag(event: PointerEvent, renderedWidth: number): void {
    event.preventDefault();
    dragStart = { x: event.clientX, width: renderedWidth };
    dragWidth.value = clampSidePanelWidth(renderedWidth, bounds);
  }

  function drag(event: PointerEvent): void {
    if (dragStart === null) return;
    const next = dragStart.width + dragStart.x - event.clientX;
    dragWidth.value = clampSidePanelWidth(next, bounds);
  }

  function endDrag(): void {
    if (dragStart === null) return;
    dragStart = null;
    commit(width.value);
    dragWidth.value = null;
  }

  function resizeFromKey(event: KeyboardEvent): void {
    const step = KEYBOARD_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    commit(step(width.value, bounds));
  }

  return {
    width,
    bounds,
    isDragging: computed(() => dragWidth.value !== null),
    startDrag,
    drag,
    endDrag,
    resizeFromKey,
    reset: () => commit(bounds.defaultWidth),
  };
}
