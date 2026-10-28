import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from "vue";

/** @internal */
export const RESIZE_KEYBOARD_STEP_PX = 16;

/**
 * The edge of the window a resizable sheet is attached to: its handle sits on
 * the opposite, inner edge. `left` / `right` sheets resize their width,
 * `top` / `bottom` ones their height.
 *
 * @internal
 */
export type ResizeSide = "left" | "right" | "top" | "bottom";

/**
 * The sizes a sheet may take, in px. Without `defaultSize` the sheet keeps
 * its natural size until the user resizes it, and a reset goes back to it.
 *
 * @internal
 */
export interface ResizeBounds {
  defaultSize?: number;
  minSize: number;
  maxSize: number;
}

/**
 * Where the size the user gives a sheet is kept: `write(undefined)` forgets
 * it.
 *
 * @internal
 */
export interface ResizeStorage {
  read: () => number | undefined;
  write: (size: number | undefined) => void;
}

/** @internal */
export interface ResizableSizeOptions {
  side: ResizeSide;
  bounds: MaybeRefOrGetter<ResizeBounds>;
  storage: ResizeStorage;
  /**
   * The size while the handle is dragged (`null` at rest), for a caller that
   * shares it with the rest of the page (the dashboard frame follows a side
   * panel's handle). A local ref otherwise.
   */
  liveSize?: Ref<number | null>;
}

/** @internal */
export interface ResizableSize {
  /** The size in px, `undefined` while the sheet keeps its natural size. */
  size: Readonly<Ref<number | undefined>>;
  bounds: Readonly<Ref<ResizeBounds>>;
  isDragging: Readonly<Ref<boolean>>;
  startDrag: (event: PointerEvent, renderedSize: number) => void;
  drag: (event: PointerEvent) => void;
  endDrag: () => void;
  /** Arrow keys, Home and End; `renderedSize` stands for a natural size. */
  resizeFromKey: (event: KeyboardEvent, renderedSize?: number) => void;
  reset: () => void;
}

type SizeStep = (size: number, bounds: ResizeBounds) => number;

const grow: SizeStep = (size) => size + RESIZE_KEYBOARD_STEP_PX;
const shrink: SizeStep = (size) => size - RESIZE_KEYBOARD_STEP_PX;

const KEYBOARD_STEPS: Record<ResizeSide, Record<string, SizeStep>> = {
  right: { ArrowLeft: grow, ArrowRight: shrink },
  left: { ArrowRight: grow, ArrowLeft: shrink },
  bottom: { ArrowUp: grow, ArrowDown: shrink },
  top: { ArrowDown: grow, ArrowUp: shrink },
};

const BOUND_KEYS = {
  Home: (_, bounds) => bounds.minSize,
  End: (_, bounds) => bounds.maxSize,
} satisfies Record<string, SizeStep>;

interface PointerAxis {
  coordinate: (event: PointerEvent) => number;
  /** +1 when moving the pointer along the axis grows the sheet. */
  direction: 1 | -1;
}

const POINTER_AXES: Record<ResizeSide, PointerAxis> = {
  right: { coordinate: (event) => event.clientX, direction: -1 },
  left: { coordinate: (event) => event.clientX, direction: 1 },
  bottom: { coordinate: (event) => event.clientY, direction: -1 },
  top: { coordinate: (event) => event.clientY, direction: 1 },
};

interface DragStart {
  position: number;
  size: number;
}

/** @internal */
export function clampSize(size: number, bounds: ResizeBounds): number {
  return Math.round(Math.min(bounds.maxSize, Math.max(bounds.minSize, size)));
}

/**
 * The size of a sheet docked on one edge of the window (a side panel, a
 * drawer) and the handlers of the resize handle on its inner edge: dragging,
 * the arrow / Home / End keys, and a reset. The size is written to `storage`
 * once a change settles; while the handle is dragged, `liveSize` holds it.
 *
 * @internal
 */
export function useResizableSize(options: ResizableSizeOptions): ResizableSize {
  const { storage } = options;
  const axis = POINTER_AXES[options.side];
  const keySteps: (typeof KEYBOARD_STEPS)[ResizeSide] = {
    ...KEYBOARD_STEPS[options.side],
    ...BOUND_KEYS,
  };
  const liveSize = options.liveSize ?? ref<number | null>(null);
  const bounds = computed(() => toValue(options.bounds));
  const size = computed(() => {
    if (liveSize.value !== null) return liveSize.value;
    const stored = storage.read() ?? bounds.value.defaultSize;
    return stored === undefined ? undefined : clampSize(stored, bounds.value);
  });
  let dragStart: DragStart | null = null;

  function commit(next: number): void {
    storage.write(clampSize(next, bounds.value));
  }

  function startDrag(event: PointerEvent, renderedSize: number): void {
    event.preventDefault();
    dragStart = { position: axis.coordinate(event), size: renderedSize };
    liveSize.value = clampSize(renderedSize, bounds.value);
  }

  function drag(event: PointerEvent): void {
    if (dragStart === null) return;
    const moved = axis.coordinate(event) - dragStart.position;
    const next = dragStart.size + moved * axis.direction;
    liveSize.value = clampSize(next, bounds.value);
  }

  function endDrag(): void {
    if (dragStart === null) return;
    dragStart = null;
    if (size.value !== undefined) commit(size.value);
    liveSize.value = null;
  }

  function resizeFromKey(event: KeyboardEvent, renderedSize?: number): void {
    const step = keySteps[event.key];
    const current = size.value ?? renderedSize;
    if (!step || current === undefined) return;
    event.preventDefault();
    commit(step(current, bounds.value));
  }

  function reset(): void {
    const { defaultSize } = bounds.value;
    if (defaultSize === undefined) storage.write(undefined);
    else commit(defaultSize);
  }

  return {
    size,
    bounds,
    isDragging: computed(() => liveSize.value !== null),
    startDrag,
    drag,
    endDrag,
    resizeFromKey,
    reset,
  };
}
