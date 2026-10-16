import { onBeforeUnmount, onMounted, type ComputedRef } from "vue";
import { useRefreshTriggers } from "../../build/composables/blocks/useRefreshTriggers";
import { usePageLive } from "./usePageLive";

const MS_PER_SECOND = 1000;
// How often an idle refresh looks at the clock: a read lands at most this
// late after its idle period.
const IDLE_CHECK_MS = 5 * MS_PER_SECOND;

/** What makes a module's component read its data again (see {@link usePageLiveRefresh}). */
export interface PageLiveRefreshOptions {
  /**
   * Realtime topics whose events make the component read again, as a
   * built-in block's `realtimeTopic`.
   */
  realtimeTopic?: string | string[];
  /**
   * Reads again after this many seconds without a read, while the page is
   * live: for data that moves with time alone (a health judged over the last
   * hour, a "last seen"), when no event comes. Nothing is read while paused.
   */
  idleRefresh?: number;
}

/** The refresh of a module's component, gated like a built-in block's. */
export interface PageLiveRefresh {
  /** Events the component missed while the page is paused, 0 when live. */
  missed: ComputedRef<number>;
  /**
   * A read nobody asked for (a clock, a feed of the component's own): capped
   * by `maxRate` in Direct, counted while paused and read once on resume.
   */
  trigger: () => void;
  /** Reads now, paused or not, as an action of the user does. */
  refreshNow: () => void;
}

/**
 * Keeps a module's own component in step with the page's Live / Pause state
 * exactly as the built-in blocks with a `realtimeTopic` are: `refresh` runs on
 * the events of `realtimeTopic` and on `refreshLivePageBlocks()` at most once
 * per `maxRate` in Direct (the slower `slowRateAfter` rate once the page's
 * `PeriodSelector` shows a long period), the last event of a burst included;
 * paused, nothing runs, the missed events count in the toggle's "N new", and
 * one read catches up on resume. `refreshPageBlocks()`, an action of the
 * user, runs it at once, paused or not.
 *
 * On a page without `live`, `refresh` runs on every event and every refresh
 * of the page. Call it from a component's setup; the subscriptions end with
 * the component.
 *
 * A `useApiData` read already follows the page's refreshes and the events of
 * the page's own topics: this is for a topic of the component's own, or an
 * idle refresh. Its read then opts out of the page's data refresh, which
 * would read it a second time.
 *
 * ```ts
 * const { data, refresh } = useApiData<Health>("/api/health", {
 *   refreshOnPageRefresh: false,
 * });
 * usePageLiveRefresh(() => void refresh(), {
 *   realtimeTopic: "api:requests",
 *   idleRefresh: 60,
 * });
 * ```
 */
export function usePageLiveRefresh(
  refresh: () => void,
  options: PageLiveRefreshOptions = {},
): PageLiveRefresh {
  let lastReadAt = Date.now();
  const read = () => {
    lastReadAt = Date.now();
    refresh();
  };
  const gate = useRefreshTriggers(options.realtimeTopic, read);
  if (options.idleRefresh) {
    useIdleRefresh(
      options.idleRefresh * MS_PER_SECOND,
      () => lastReadAt,
      gate.trigger,
    );
  }
  return {
    missed: gate.missed,
    trigger: () => gate.trigger(),
    refreshNow: () => gate.catchUp(),
  };
}

// Browser only, from mount: a server render reads once and has no clock.
function useIdleRefresh(
  idleMs: number,
  lastReadAt: () => number,
  trigger: () => void,
): void {
  const live = usePageLive();
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    timer = setInterval(
      () => {
        if (live.isPaused.value) return;
        if (Date.now() - lastReadAt() >= idleMs) trigger();
      },
      Math.min(idleMs, IDLE_CHECK_MS),
    );
  });
  onBeforeUnmount(() => clearInterval(timer));
}
