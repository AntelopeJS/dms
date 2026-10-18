import { computed, type ComputedRef } from "vue";
import {
  type PageToolbarSize,
  usePageToolbar,
} from "../../build/composables/page-toolbar/pageToolbarContext";
import { PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES } from "../../build/composables/page-toolbar/toolbarControlHeight";

const DEFAULT_SIZE: PageToolbarSize = "sm";

/** The size of the `PageToolbar` holding a component (see {@link usePageToolbarSize}). */
export interface PageToolbarSizeState {
  /** The toolbar's size, `sm` outside one. */
  size: ComputedRef<PageToolbarSize>;
  /** The height class its controls share at that size (`h-7` at `sm`). */
  heightClass: ComputedRef<string>;
}

/**
 * The size of the `PageToolbar` a module's component sits in, for a leading
 * block (a scope chip, a picker) to stand as tall as the toggle and the
 * period beside it.
 */
export function usePageToolbarSize(): PageToolbarSizeState {
  const toolbar = usePageToolbar();
  const size = computed(() => toolbar?.size.value ?? DEFAULT_SIZE);
  return {
    size,
    heightClass: computed(
      () => PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES[size.value],
    ),
  };
}
