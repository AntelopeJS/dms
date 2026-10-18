import {
  computed,
  type ComputedRef,
  type InjectionKey,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
} from "vue";

/** The sizes a `PageToolbar` draws its controls at. */
export type PageToolbarSize = "xs" | "sm" | "md";

/**
 * What a `PageToolbar` gives the blocks it holds.
 *
 * @internal
 */
export interface PageToolbarContext {
  /** The size its `LiveToggle` and `PeriodSelector` take unless they set one. */
  size: ComputedRef<PageToolbarSize>;
  /** A `LiveToggle` is mounted in it: the toolbar leaves the updated label to it. */
  hasLiveToggle: ComputedRef<boolean>;
  /** Counts a mounted `LiveToggle`; returns the uncount. */
  registerLiveToggle(): () => void;
}

const PAGE_TOOLBAR_KEY: InjectionKey<PageToolbarContext> =
  Symbol("dms-page-toolbar");

/**
 * Provides the context of a `PageToolbar` to the blocks it holds.
 *
 * @internal
 */
export function providePageToolbar(
  size: ComputedRef<PageToolbarSize>,
): PageToolbarContext {
  const liveToggles = ref(0);
  const context: PageToolbarContext = {
    size,
    hasLiveToggle: computed(() => liveToggles.value > 0),
    registerLiveToggle() {
      liveToggles.value += 1;
      return () => {
        liveToggles.value -= 1;
      };
    },
  };
  provide(PAGE_TOOLBAR_KEY, context);
  return context;
}

/**
 * The `PageToolbar` holding the calling block, `null` outside one.
 *
 * @internal
 */
export function usePageToolbar(): PageToolbarContext | null {
  return inject(PAGE_TOOLBAR_KEY, null);
}

/**
 * Tells the toolbar holding the calling `LiveToggle`, if any, that it is
 * mounted there, for as long as it is.
 *
 * @internal
 */
export function useToolbarLiveToggle(toolbar: PageToolbarContext | null): void {
  if (!toolbar) return;
  let unregister: (() => void) | undefined;
  onMounted(() => (unregister = toolbar.registerLiveToggle()));
  onBeforeUnmount(() => unregister?.());
}
