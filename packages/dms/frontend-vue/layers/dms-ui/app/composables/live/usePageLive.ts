import {
  computed,
  getCurrentScope,
  onScopeDispose,
  type ComputedRef,
} from "vue";
import { currentPageLive } from "../../build/composables/live/currentPageLive";
import type { PageLiveController } from "../../build/composables/live/pageLiveController";
import type { PageLiveNote, PageLiveNoteInput } from "../../types/live";

/** The Live / Pause state of the page on screen, for a module's component. */
export interface PageLiveState {
  /** The page declares `live`: it has a Live / Pause state at all. */
  isEnabled: ComputedRef<boolean>;
  /** The page's data follows its events: Live, or a page without `live`. */
  isLive: ComputedRef<boolean>;
  /** The page is paused: its blocks request nothing on their events. */
  isPaused: ComputedRef<boolean>;
  /**
   * Why the page paused by itself: a hold's reason, or its tab hidden in the
   * background. `null` while live, and while paused by the user.
   */
  pauseReason: ComputedRef<PageLiveNote | null>;
  pause: () => void;
  /**
   * Leaves the pause: each block that missed an event refetches once. It also
   * lifts the holds of the moment, until their component releases them.
   */
  resume: () => void;
  toggle: () => void;
  /**
   * Holds the page paused for a reason, until `release()` or until the
   * component goes: while the user types in a form whose results the live
   * data would move, say. The toggle reads "Paused · <reason>"; give an i18n
   * key prefixed with `$` (`hold("$api.live.typing_in_tester")`). Calling it
   * again changes the reason. The page resumes once nothing holds it, unless
   * the user paused it.
   */
  hold: (reason: PageLiveNoteInput) => void;
  /** Drops this component's hold, if it holds the page. */
  release: () => void;
  /** When the page last read its data (ms since the epoch), `null` without `live`. */
  lastUpdatedAt: ComputedRef<number | null>;
  /**
   * What the page missed since the pause, in published rows: a message's
   * `payload.ids` count once per row, its `payload.count` as that many, any
   * other message as one.
   */
  missedCount: ComputedRef<number>;
  /** The breakdown of what was missed, as `setMissedDetail` gave it. */
  missedDetail: ComputedRef<PageLiveNote | null>;
  /**
   * Gives the toggle a breakdown of what was missed, shown after the count
   * ("Paused · 40 new requests · 2 in 5xx"): a component following the page's
   * topic tallies what it cares about while paused and says it here, e.g.
   * `setMissedDetail({ text: "$api.live.in_5xx", params: { count: 2 }, tone: "error" })`.
   * Cleared on resume; `null` clears it.
   */
  setMissedDetail: (detail: PageLiveNoteInput | null) => void;
  /** The realtime stream is down and the page reads its blocks on a clock. */
  isPolling: ComputedRef<boolean>;
}

/**
 * Follows the Live / Pause state of the page on screen (see the page option
 * `live` and the `LiveToggle()` block), so a custom block stays in step with
 * the built-in ones without reading the DOM: stop a client-side ticker while
 * paused, show what was missed, offer its own switch, hold the page while the
 * user types.
 *
 * On a page without `live`, or while server-rendering, `isEnabled` is false,
 * the page reads as live and never paused, and its actions do nothing.
 *
 * ```ts
 * const { isPaused, missedCount, resume, hold, release } = usePageLive();
 * ```
 *
 * A component that refetches on its own realtime topic need not read it:
 * `usePageLiveRefresh` gates its refresh as the built-in blocks with a
 * `realtimeTopic` are.
 */
export function usePageLive(): PageLiveState {
  const isPaused = computed(() => currentPageLive()?.isPaused.value ?? false);
  const hold = usePageLiveHold();
  return {
    isEnabled: computed(() => currentPageLive() !== null),
    isLive: computed(() => !isPaused.value),
    isPaused,
    pauseReason: computed(() => currentPageLive()?.pauseReason.value ?? null),
    pause: () => currentPageLive()?.pause(),
    resume: () => currentPageLive()?.resume(),
    toggle: () => currentPageLive()?.toggle(),
    hold: hold.hold,
    release: hold.release,
    lastUpdatedAt: computed(
      () => currentPageLive()?.lastUpdatedAt.value ?? null,
    ),
    missedCount: computed(() => currentPageLive()?.missedCount.value ?? 0),
    missedDetail: computed(() => currentPageLive()?.missedDetail.value ?? null),
    setMissedDetail: (detail) => currentPageLive()?.setMissedDetail(detail),
    isPolling: computed(() => currentPageLive()?.isPolling.value ?? false),
  };
}

interface PageLiveHold {
  hold: (reason: PageLiveNoteInput) => void;
  release: () => void;
}

// One hold per call of usePageLive, released with the component's scope: a
// component leaving the page never leaves it paused.
function usePageLiveHold(): PageLiveHold {
  const owner = Symbol("page-live-hold");
  let holder: PageLiveController | null = null;
  const release = () => {
    holder?.release(owner);
    holder = null;
  };
  if (getCurrentScope()) onScopeDispose(release);
  return {
    hold: (reason) => {
      const controller = currentPageLive();
      if (holder !== controller) release();
      holder = controller;
      controller?.hold(owner, reason);
    },
    release,
  };
}
