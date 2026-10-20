import { ref, type Component, type Ref } from "vue";
import type { DrawerDirection } from "../../../composables/containers/types";
import type { ModalSize } from "../../../types/modal";
import type { ResizeBounds, ResizeStorage } from "./useResizableSize";

/** @internal */
export const DRAWER_SIZE_COOKIE = "dms-drawer-sizes";
const DRAWER_SIZE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
// A cookie travels with every request: the oldest sizes give way past this.
const MAX_STORED_SIZES = 40;

/** Width of a `left` / `right` drawer without `size`, from `lg`. @internal */
export const DEFAULT_SIDE_DRAWER_WIDTH = 600;
/** @internal */
export const MIN_SIDE_DRAWER_WIDTH = 360;
/** @internal */
export const MIN_EDGE_DRAWER_HEIGHT = 240;
// Share of the window a resized drawer may take, and the room it leaves (the
// drawer's own `max-w-[calc(100%-2rem)]`).
const MAX_DRAWER_SHARE = 0.9;
const DRAWER_WINDOW_MARGIN = 32;

/**
 * A modal's width at each size (see `DynamicModal`): the width a sized side
 * drawer opens at. `full` takes the whole window.
 *
 * @internal
 */
export const DRAWER_SIZE_WIDTHS: Record<Exclude<ModalSize, "full">, number> = {
  sm: 384,
  md: 448,
  lg: 512,
  xl: 576,
  "2xl": 672,
  "3xl": 768,
  "4xl": 896,
  "5xl": 1024,
};

/**
 * The sizes the user gave drawers on this device, per drawer key: widths of
 * `left` / `right` drawers, heights of `top` / `bottom` ones.
 *
 * @internal
 */
export interface DrawerSizePreferences {
  widths: Record<string, number>;
  heights: Record<string, number>;
}

type DrawerSizeAxis = keyof DrawerSizePreferences;

/** @internal */
export interface Viewport {
  width: number;
  height: number;
}

const SIDE_DIRECTIONS: ReadonlySet<DrawerDirection> = new Set([
  "left",
  "right",
]);

/** @internal */
export function isSideDrawer(direction: DrawerDirection): boolean {
  return SIDE_DIRECTIONS.has(direction);
}

function emptyPreferences(): DrawerSizePreferences {
  return { widths: {}, heights: {} };
}

function readSizes(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, size]) => typeof size === "number" && Number.isFinite(size),
    ),
  ) as Record<string, number>;
}

/**
 * Reads the cookie back defensively: an older or hand-edited value must not
 * break a drawer.
 *
 * @internal
 */
export function readDrawerSizePreferences(
  value: unknown,
): DrawerSizePreferences {
  if (typeof value !== "object" || value === null) return emptyPreferences();
  const record = value as Record<string, unknown>;
  return {
    widths: readSizes(record.widths),
    heights: readSizes(record.heights),
  };
}

/** @internal */
export function useDrawerSizePreferences(): Ref<DrawerSizePreferences> {
  return useDmsCookie<DrawerSizePreferences>(DRAWER_SIZE_COOKIE, {
    default: emptyPreferences,
    maxAge: DRAWER_SIZE_COOKIE_MAX_AGE,
  });
}

// The key written last moves to the end, so the oldest ones are dropped
// first.
function withSize(
  sizes: Record<string, number>,
  key: string,
  size: number | undefined,
): Record<string, number> {
  const { [key]: _previous, ...others } = sizes;
  const kept = Object.entries(others).slice(
    -(MAX_STORED_SIZES - (size === undefined ? 0 : 1)),
  );
  return Object.fromEntries(size === undefined ? kept : [...kept, [key, size]]);
}

/**
 * Where a drawer keeps the size the user gives it: under `key`, on the axis
 * its direction resizes. A drawer without a key is resizable, but forgets.
 *
 * @internal
 */
export function drawerSizeStorage(
  preferences: Ref<DrawerSizePreferences>,
  key: string | undefined,
  direction: DrawerDirection,
): ResizeStorage {
  const axis: DrawerSizeAxis = isSideDrawer(direction) ? "widths" : "heights";
  const unsaved = ref<number | undefined>();
  if (!key) {
    return {
      read: () => unsaved.value,
      write: (size) => {
        unsaved.value = size;
      },
    };
  }
  return {
    read: () => readDrawerSizePreferences(preferences.value)[axis][key],
    write: (size) => {
      const current = readDrawerSizePreferences(preferences.value);
      preferences.value = {
        ...current,
        [axis]: withSize(current[axis], key, size),
      };
    },
  };
}

const COMPONENT_SIZE_KEY_PREFIX = "component:";
// The name `defineAsyncComponent` gives every wrapper: it names no drawer.
const ASYNC_WRAPPER_NAME = "AsyncComponentWrapper";

interface NamedComponent {
  name?: string;
  /** The file name a `<script setup>` component is compiled with. */
  __name?: string;
}

/**
 * The key a drawer opened without `sizeKey` or `containerId` keeps its size
 * under: its component's name, the same at every opening. Undefined for an
 * anonymous component, which forgets.
 *
 * @internal
 */
export function componentSizeKey(component: Component): string | undefined {
  const { name, __name } = component as NamedComponent;
  const componentName = [name, __name].find(
    (candidate) => candidate && candidate !== ASYNC_WRAPPER_NAME,
  );
  return componentName
    ? `${COMPONENT_SIZE_KEY_PREFIX}${componentName}`
    : undefined;
}

function sideDrawerWidthBounds(
  viewport: Viewport,
  size?: ModalSize,
): ResizeBounds {
  if (size === "full") {
    return {
      defaultSize: viewport.width,
      minSize: Math.min(MIN_SIDE_DRAWER_WIDTH, viewport.width),
      maxSize: viewport.width,
    };
  }
  const maxSize = Math.max(
    0,
    Math.min(
      viewport.width * MAX_DRAWER_SHARE,
      viewport.width - DRAWER_WINDOW_MARGIN,
    ),
  );
  const minSize = Math.min(MIN_SIDE_DRAWER_WIDTH, maxSize);
  const preferred = size ? DRAWER_SIZE_WIDTHS[size] : DEFAULT_SIDE_DRAWER_WIDTH;
  return {
    defaultSize: Math.min(maxSize, Math.max(minSize, preferred)),
    minSize,
    maxSize,
  };
}

// A top or bottom drawer keeps its natural height until the user resizes it.
function edgeDrawerHeightBounds(viewport: Viewport): ResizeBounds {
  const maxSize = Math.round(viewport.height * MAX_DRAWER_SHARE);
  return { minSize: Math.min(MIN_EDGE_DRAWER_HEIGHT, maxSize), maxSize };
}

/**
 * The sizes a drawer may take in this window: a side drawer's width (600px
 * by default, or a modal's width at its `size`), an edge drawer's height
 * (its natural one by default). Both stop at 90% of the window.
 *
 * @internal
 */
export function resolveDrawerSizeBounds(
  direction: DrawerDirection,
  viewport: Viewport,
  size?: ModalSize,
): ResizeBounds {
  return isSideDrawer(direction)
    ? sideDrawerWidthBounds(viewport, size)
    : edgeDrawerHeightBounds(viewport);
}
