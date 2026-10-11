import { readonly, ref, type Ref } from "vue";
import type { PageLiveOptions } from "../../../types/live";

const MS_PER_SECOND = 1000;
const STORAGE_KEY_PREFIX = "dms.live.paused:";
const PAUSED_VALUE = "1";

/**
 * One block or table of a live page: what it reads again, and what it missed
 * while the page was paused.
 *
 * @internal
 */
export interface LiveSubscription {
  /**
   * An event behind the block arrived. `event` identifies it, so one event
   * reaching several blocks counts once in the page's `missedCount`.
   */
  trigger(event?: object): void;
  /** Events the block received while paused and has not read yet. */
  readonly missed: Readonly<Ref<number>>;
  /** Reads now, whatever the state, and forgets what was missed. */
  catchUp(): void;
  unsubscribe(): void;
}

/**
 * The Direct / Pause state of one page and the gate every refetch of its
 * blocks goes through (see `PageLiveOptions` in interface-dms).
 *
 * @internal
 */
export interface PageLiveController {
  readonly pageId: string;
  readonly isPaused: Readonly<Ref<boolean>>;
  /** When the page last read its data (ms since the epoch). */
  readonly lastUpdatedAt: Readonly<Ref<number>>;
  /** Distinct events received since the pause. */
  readonly missedCount: Readonly<Ref<number>>;
  pause(): void;
  resume(): void;
  toggle(): void;
  subscribe(refresh: () => void): LiveSubscription;
  dispose(): void;
}

interface SubscriberState {
  refresh: () => void;
  missed: Ref<number>;
  lastRunAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** The event the trailing call stands for, counted if the page pauses first. */
  pendingEvent: object | undefined;
}

/** Browser storage of the paused pages; absent on the server or when denied. */
function liveStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readStoredPause(pageId: string): boolean {
  return liveStorage()?.getItem(STORAGE_KEY_PREFIX + pageId) === PAUSED_VALUE;
}

function storePause(pageId: string, isPaused: boolean): void {
  const storage = liveStorage();
  if (!storage) return;
  try {
    if (isPaused) storage.setItem(STORAGE_KEY_PREFIX + pageId, PAUSED_VALUE);
    else storage.removeItem(STORAGE_KEY_PREFIX + pageId);
  } catch {
    // A full or locked storage only loses the memory of the choice.
  }
}

class PageLive implements PageLiveController {
  readonly isPaused: Readonly<Ref<boolean>>;
  readonly lastUpdatedAt: Readonly<Ref<number>>;
  readonly missedCount: Readonly<Ref<number>>;
  private readonly paused: Ref<boolean>;
  private readonly updatedAt = ref(Date.now());
  private readonly missedTotal = ref(0);
  private readonly subscribers = new Set<SubscriberState>();
  private countedEvents = new WeakSet<object>();
  private readonly minIntervalMs: number;

  constructor(
    readonly pageId: string,
    options: PageLiveOptions,
  ) {
    this.minIntervalMs = (options.maxRate ?? 0) * MS_PER_SECOND;
    this.paused = ref(readStoredPause(pageId));
    this.isPaused = readonly(this.paused);
    this.lastUpdatedAt = readonly(this.updatedAt);
    this.missedCount = readonly(this.missedTotal);
  }

  pause(): void {
    if (this.paused.value) return;
    this.paused.value = true;
    storePause(this.pageId, true);
    // A trailing read still waiting stands for an event not shown yet.
    for (const state of this.subscribers) {
      if (!state.timer) continue;
      const event = state.pendingEvent;
      clearTimer(state);
      this.countMissed(state, event);
    }
  }

  resume(): void {
    if (!this.paused.value) return;
    this.paused.value = false;
    storePause(this.pageId, false);
    this.missedTotal.value = 0;
    this.countedEvents = new WeakSet();
    this.updatedAt.value = Date.now();
    for (const state of this.subscribers) {
      if (state.missed.value === 0) continue;
      state.missed.value = 0;
      this.run(state);
    }
  }

  toggle(): void {
    if (this.paused.value) this.resume();
    else this.pause();
  }

  subscribe(refresh: () => void): LiveSubscription {
    const state: SubscriberState = {
      refresh,
      missed: ref(0),
      lastRunAt: 0,
      timer: null,
      pendingEvent: undefined,
    };
    this.subscribers.add(state);
    return {
      trigger: (event) => this.trigger(state, event),
      missed: readonly(state.missed),
      catchUp: () => {
        state.missed.value = 0;
        this.run(state);
      },
      unsubscribe: () => {
        clearTimer(state);
        this.subscribers.delete(state);
      },
    };
  }

  dispose(): void {
    for (const state of this.subscribers) clearTimer(state);
    this.subscribers.clear();
  }

  private trigger(state: SubscriberState, event: object | undefined): void {
    if (this.paused.value) this.countMissed(state, event);
    else this.triggerDirect(state, event);
  }

  // Leading and trailing: the first event of a quiet block reads at once, the
  // ones within `maxRate` of a read collapse into one read when it ends, so
  // the last event of a burst is never lost.
  private triggerDirect(state: SubscriberState, event: object | undefined) {
    if (state.timer) return;
    const wait = state.lastRunAt + this.minIntervalMs - Date.now();
    if (wait <= 0) {
      this.run(state);
      return;
    }
    state.pendingEvent = event;
    state.timer = setTimeout(() => this.run(state), wait);
  }

  private run(state: SubscriberState): void {
    clearTimer(state);
    state.lastRunAt = Date.now();
    this.updatedAt.value = state.lastRunAt;
    state.refresh();
  }

  private countMissed(state: SubscriberState, event: object | undefined) {
    state.missed.value += 1;
    if (event && this.countedEvents.has(event)) return;
    if (event) this.countedEvents.add(event);
    this.missedTotal.value += 1;
  }
}

function clearTimer(state: SubscriberState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.pendingEvent = undefined;
}

/**
 * The controller of a page declared with `live`. Starts in the state the
 * browser remembers for `pageId`, Direct otherwise.
 *
 * @internal
 */
export function createPageLiveController(
  pageId: string,
  options: PageLiveOptions,
): PageLiveController {
  return new PageLive(pageId, options);
}
