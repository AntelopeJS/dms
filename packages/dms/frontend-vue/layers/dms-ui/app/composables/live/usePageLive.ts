import { computed, type ComputedRef } from "vue";
import { currentPageLive } from "../../build/composables/live/currentPageLive";

/** The Direct / Pause state of the page on screen, for a module's component. */
export interface PageLiveState {
  /** The page declares `live`: it has a Direct / Pause state at all. */
  isEnabled: ComputedRef<boolean>;
  /** The page's data follows its events: Direct, or a page without `live`. */
  isLive: ComputedRef<boolean>;
  /** The page is paused: its blocks request nothing on their events. */
  isPaused: ComputedRef<boolean>;
  pause: () => void;
  /** Leaves the pause: each block that missed an event refetches once. */
  resume: () => void;
  toggle: () => void;
  /** When the page last read its data (ms since the epoch), `null` without `live`. */
  lastUpdatedAt: ComputedRef<number | null>;
  /** Distinct events the page received since the pause. */
  missedCount: ComputedRef<number>;
}

/**
 * Follows the Direct / Pause state of the page on screen (see the page option
 * `live` and the `LiveToggle()` block), so a custom block stays in step with
 * the built-in ones without reading the DOM: stop a client-side ticker while
 * paused, show what was missed, offer its own switch.
 *
 * On a page without `live`, or while server-rendering, `isEnabled` is false,
 * the page reads as live and never paused, and `pause` / `resume` do nothing.
 *
 * ```ts
 * const { isPaused, missedCount, resume } = usePageLive();
 * ```
 *
 * A component that refetches on its own realtime topic need not use it:
 * built-in blocks with a `realtimeTopic` already follow the state.
 */
export function usePageLive(): PageLiveState {
  const isPaused = computed(() => currentPageLive()?.isPaused.value ?? false);
  return {
    isEnabled: computed(() => currentPageLive() !== null),
    isLive: computed(() => !isPaused.value),
    isPaused,
    pause: () => currentPageLive()?.pause(),
    resume: () => currentPageLive()?.resume(),
    toggle: () => currentPageLive()?.toggle(),
    lastUpdatedAt: computed(
      () => currentPageLive()?.lastUpdatedAt.value ?? null,
    ),
    missedCount: computed(() => currentPageLive()?.missedCount.value ?? 0),
  };
}
