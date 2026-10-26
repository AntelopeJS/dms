import {
  isObject,
  isNumber,
} from "../../../../../dms-core/app/utils/type-check";
import { ref, type Component, type ComponentOptions, type Ref } from "vue";
import type { DrawerDirection } from "../../../composables/containers/types";
import type { ModalSize } from "../../../types/modal";
import type { ResizeBounds, ResizeStorage } from "./useResizableSize";

/** @internal */
export const DRAWER_SIZE_COOKIE = "dms-drawer-sizes";
const DRAWER_SIZE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const MAX_STORED_SIZES = 40;

/** Width of a `left` / `right` drawer without `size`, from `lg`. @internal */
export const DEFAULT_SIDE_DRAWER_WIDTH = 600;
/** @internal */
export const MIN_SIDE_DRAWER_WIDTH = 360;
/** @internal */
export const MIN_EDGE_DRAWER_HEIGHT = 240;

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

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This cookie decoder accepts malformed persisted values and filters them here.
function readSizes(value: unknown): Record<string, number> {
  if (!isObject(value) || value === null) return {};
  const entries: [string, unknown][] = Object.entries(value);
  return Object.fromEntries(
    entries.filter(
      (entry): entry is [string, number] =>
        isNumber(entry[1]) && Number.isFinite(entry[1]),
    ),
  );
}

/**
 * Reads the cookie back defensively: an older or hand-edited value must not
 * break a drawer.
 *
 * @internal
 */
export function readDrawerSizePreferences(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The persisted cookie is decoded here, not trusted as DrawerSizePreferences.
  value: unknown,
): DrawerSizePreferences {
  if (!isObject(value) || value === null) return emptyPreferences();
  const record = value;
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

const ASYNC_WRAPPER_NAME = "AsyncComponentWrapper";

/**
 * The key a drawer opened without `sizeKey` or `containerId` keeps its size
 * under: its component's name, the same at every opening. Undefined for an
 * anonymous component, which forgets.
 *
 * @internal
 */
export function componentSizeKey(component: Component): string | undefined {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Component's constructor branch does not constrain these metadata fields; retain unchecked name selection and interpolation.
  const named = component as Pick<ComponentOptions, "name" | "__name">;
  const { name, __name } = named;
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
