import type { Ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
import {
  resolveSidePanelWidthBounds,
  type SidePanel,
  type SidePanelWidthBounds,
} from "../../../composables/useAppSidePanels";

/** @internal */
export const SIDE_PANEL_WIDTH_STORAGE_PREFIX = "dms-side-panel-width:";
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

function clamp(width: number, bounds: SidePanelWidthBounds): number {
  return Math.round(
    Math.min(bounds.maxWidth, Math.max(bounds.minWidth, width)),
  );
}

/**
 * The width of a docked side panel and the handlers of its resize handle:
 * dragging, the arrow / Home / End keys, and a reset to the default width.
 * The width is kept in local storage per panel id, written once a change
 * settles rather than on every pointer move.
 *
 * @internal
 */
export function useSidePanelWidth(panel: SidePanel): SidePanelWidth {
  const bounds = resolveSidePanelWidthBounds(panel);
  const storedWidth = useLocalStorage<number>(
    `${SIDE_PANEL_WIDTH_STORAGE_PREFIX}${panel.id}`,
    bounds.defaultWidth,
  );
  const width = ref(clamp(Number(storedWidth.value), bounds));
  const isDragging = ref(false);
  let dragStart: DragStart | null = null;

  function commit(next: number): void {
    width.value = clamp(next, bounds);
    storedWidth.value = width.value;
  }

  function startDrag(event: PointerEvent, renderedWidth: number): void {
    event.preventDefault();
    dragStart = { x: event.clientX, width: renderedWidth };
    isDragging.value = true;
  }

  function drag(event: PointerEvent): void {
    if (dragStart === null) return;
    width.value = clamp(dragStart.width + dragStart.x - event.clientX, bounds);
  }

  function endDrag(): void {
    if (dragStart === null) return;
    dragStart = null;
    isDragging.value = false;
    commit(width.value);
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
    isDragging,
    startDrag,
    drag,
    endDrag,
    resizeFromKey,
    reset: () => commit(bounds.defaultWidth),
  };
}
