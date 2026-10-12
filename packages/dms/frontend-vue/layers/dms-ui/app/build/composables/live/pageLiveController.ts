import {
  computed,
  readonly,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
} from "vue";
import type {
  PageLiveNote,
  PageLiveNoteInput,
  PageLiveOptions,
} from "../../../types/live";
import { refreshLivePageBlocks } from "../../../utils/blockRefresh";
import { liveIntervalMs } from "./liveCadence";
import { LiveHolds, toLiveNote } from "./liveHolds";
import { LivePoller } from "./livePoller";
import { liveStorageKey, readStoredPause, storePause } from "./liveStorage";
import { MissedTally } from "./missedTally";

/**
 * Why a page hidden in a background tab is paused.
 *
 * @internal
 */
export const HIDDEN_TAB_NOTE: PageLiveNote = {
  text: "$dms.live.reason_hidden",
};

/**
 * One block or table of a live page: what it reads again, and what it missed
 * while the page was paused or the block held.
 *
 * @internal
 */
export interface LiveSubscription {
  /**
   * An event behind the block arrived. `event` identifies it, so one event
   * reaching several blocks counts once in the page's `missedCount`; its
   * `payload.ids` or `payload.count` say how many rows it stands for.
   */
  trigger(event?: object): void;
  /** Rows and events the block received while paused or held, not read yet. */
  readonly missed: Readonly<Ref<number>>;
  /** When the block last read through the gate (ms since the epoch), 0 before. */
  readonly lastReadAt: Readonly<Ref<number>>;
  /** Reads now, whatever the state, and forgets what was missed. */
  catchUp(): void;
  /**
   * Records a read the block made by itself (one the user asked for): it
   * forgets what was missed, and a waiting trailing read is dropped.
   */
  acknowledge(): void;
  /**
   * Holds the block alone while the page stays live: its events are counted,
   * not read. Released on a live page, it reads once if it missed any.
   */
  setHeld(isHeld: boolean): void;
  unsubscribe(): void;
}

/** How the page starts, beside what the browser remembers. @internal */
export interface PageLiveStart {
  /** The URL asked for the page paused (`?live=0`): not remembered. */
  isPausedByUrl?: boolean;
  /** Reads the page's blocks while the stream is down; `refreshLivePageBlocks`. */
  poll?: () => void;
  /**
   * Starts live whatever the browser remembers, until `restoreChoice()`: the
   * page renderer restores it once mounted, so hydration matches the server.
   */
  isRestoreDeferred?: boolean;
}

/**
 * The Live / Pause state of one page and the gate every refetch of its
 * blocks goes through (see `PageLiveOptions` in interface-dms).
 *
 * @internal
 */
export interface PageLiveController {
  readonly pageId: string;
  readonly isPaused: Readonly<Ref<boolean>>;
  /** Why the page paused by itself; `null` when live or paused by the user. */
  readonly pauseReason: ComputedRef<PageLiveNote | null>;
  /** When the page last read its data (ms since the epoch). */
  readonly lastUpdatedAt: Readonly<Ref<number>>;
  /** Rows and distinct events received since the pause. */
  readonly missedCount: Readonly<Ref<number>>;
  /** What a module's component says the missed events hold. */
  readonly missedDetail: Readonly<Ref<PageLiveNote | null>>;
  /** The stream is down and the page reads its blocks on a clock. */
  readonly isPolling: Readonly<Ref<boolean>>;
  /**
   * Applies the remembered choice and `?live=0`, once: what the controller
   * does on creation unless `isRestoreDeferred`.
   */
  restoreChoice(): void;
  pause(): void;
  /** Leaves the user's pause and lifts the holds of the moment. */
  resume(): void;
  toggle(): void;
  hold(owner: symbol, reason: PageLiveNoteInput): void;
  release(owner: symbol): void;
  setMissedDetail(detail: PageLiveNoteInput | null): void;
  setHidden(isHidden: boolean): void;
  setStreamConnected(isConnected: boolean): void;
  /** The span of a period the page shows, `null` once it is gone. */
  reportPeriodSpan(owner: symbol, spanMs: number | null): void;
  subscribe(refresh: () => void): LiveSubscription;
  dispose(): void;
}

interface SubscriberState {
  refresh: () => void;
  tally: MissedTally;
  lastRunAt: Ref<number>;
  timer: ReturnType<typeof setTimeout> | null;
  /** The events the trailing call stands for, counted if the page pauses first. */
  pendingEvents: Array<object | undefined>;
  isHeld: boolean;
}

class PageLive implements PageLiveController {
  readonly isPaused: Readonly<Ref<boolean>>;
  readonly pauseReason: ComputedRef<PageLiveNote | null>;
  readonly lastUpdatedAt: Readonly<Ref<number>>;
  readonly missedCount: Readonly<Ref<number>>;
  readonly missedDetail: Readonly<Ref<PageLiveNote | null>>;
  readonly isPolling: Readonly<Ref<boolean>>;
  private readonly paused = ref(false);
  private readonly isUserPaused = ref(false);
  private readonly isPausedByUrl: boolean;
  private isRestored = false;
  private readonly isHidden = ref(false);
  private readonly holds = new LiveHolds();
  private readonly detail = shallowRef<PageLiveNote | null>(null);
  private readonly updatedAt = ref(Date.now());
  private readonly tally = new MissedTally();
  private readonly subscribers = new Set<SubscriberState>();
  private readonly periodSpans = new Map<symbol, number>();
  private readonly poller: LivePoller;
  private readonly storageKey: string;
  private isStreamConnected = true;

  constructor(
    readonly pageId: string,
    private readonly options: PageLiveOptions,
    start: PageLiveStart = {},
  ) {
    this.storageKey = liveStorageKey(pageId, options.rememberKey);
    this.isPausedByUrl = !!start.isPausedByUrl;
    this.poller = new LivePoller(
      () => this.intervalMs(),
      start.poll ?? refreshLivePageBlocks,
    );
    this.isPaused = readonly(this.paused);
    this.pauseReason = computed(() => this.reason());
    this.lastUpdatedAt = readonly(this.updatedAt);
    this.missedCount = this.tally.total;
    this.missedDetail = readonly(this.detail);
    this.isPolling = this.poller.isPolling;
    if (!start.isRestoreDeferred) this.restoreChoice();
  }

  restoreChoice(): void {
    if (this.isRestored) return;
    this.isRestored = true;
    if (!this.isPausedByUrl && !readStoredPause(this.storageKey)) return;
    this.isUserPaused.value = true;
    this.sync();
  }

  pause(): void {
    if (this.isUserPaused.value) return;
    this.isUserPaused.value = true;
    storePause(this.storageKey, true);
    this.sync();
  }

  resume(): void {
    if (this.isUserPaused.value) {
      this.isUserPaused.value = false;
      storePause(this.storageKey, false);
    }
    this.holds.liftAll();
    this.sync();
  }

  toggle(): void {
    if (this.paused.value) this.resume();
    else this.pause();
  }

  hold(owner: symbol, reason: PageLiveNoteInput): void {
    this.holds.set(owner, reason);
    this.sync();
  }

  release(owner: symbol): void {
    this.holds.release(owner);
    this.sync();
  }

  setMissedDetail(detail: PageLiveNoteInput | null): void {
    this.detail.value = detail === null ? null : toLiveNote(detail);
  }

  setHidden(isHidden: boolean): void {
    this.isHidden.value = isHidden;
    this.sync();
  }

  setStreamConnected(isConnected: boolean): void {
    this.isStreamConnected = isConnected;
    this.updatePolling();
  }

  reportPeriodSpan(owner: symbol, spanMs: number | null): void {
    if (spanMs === null) this.periodSpans.delete(owner);
    else this.periodSpans.set(owner, spanMs);
  }

  subscribe(refresh: () => void): LiveSubscription {
    const state: SubscriberState = {
      refresh,
      tally: new MissedTally(),
      lastRunAt: ref(0),
      timer: null,
      pendingEvents: [],
      isHeld: false,
    };
    this.subscribers.add(state);
    return {
      trigger: (event) => this.trigger(state, event),
      missed: state.tally.total,
      lastReadAt: readonly(state.lastRunAt),
      catchUp: () => this.catchUp(state),
      acknowledge: () => {
        state.tally.reset();
        this.markRead(state);
      },
      setHeld: (isHeld) => this.setHeld(state, isHeld),
      unsubscribe: () => {
        clearTimer(state);
        this.subscribers.delete(state);
      },
    };
  }

  dispose(): void {
    for (const state of this.subscribers) clearTimer(state);
    this.subscribers.clear();
    this.poller.stop();
  }

  // A hidden tab outranks everything: nobody sees the page. The user's pause
  // comes next, and says nothing more; a hold names its reason.
  private reason(): PageLiveNote | null {
    if (this.isHidden.value) return HIDDEN_TAB_NOTE;
    if (this.isUserPaused.value) return null;
    return this.holds.activeNote.value;
  }

  private sync(): void {
    const shouldPause =
      this.isUserPaused.value || this.isHidden.value || this.holds.isActive;
    if (shouldPause !== this.paused.value) {
      if (shouldPause) this.enterPause();
      else this.leavePause();
    }
    this.updatePolling();
  }

  private enterPause(): void {
    this.paused.value = true;
    // A trailing read still waiting stands for events not shown yet.
    for (const state of this.subscribers) this.flushPending(state, true);
  }

  private leavePause(): void {
    this.paused.value = false;
    this.tally.reset();
    this.detail.value = null;
    this.updatedAt.value = Date.now();
    for (const state of this.subscribers) {
      if (state.isHeld || state.tally.total.value === 0) continue;
      this.catchUp(state);
    }
  }

  private updatePolling(): void {
    this.poller.update(!this.isStreamConnected && !this.paused.value);
  }

  private intervalMs(): number {
    const spans = [...this.periodSpans.values()];
    return liveIntervalMs(
      this.options,
      spans.length > 0 ? Math.max(...spans) : null,
    );
  }

  private setHeld(state: SubscriberState, isHeld: boolean): void {
    if (state.isHeld === isHeld) return;
    state.isHeld = isHeld;
    if (isHeld) this.flushPending(state, false);
    else if (!this.paused.value && state.tally.total.value > 0) {
      this.catchUp(state);
    }
  }

  private trigger(state: SubscriberState, event: object | undefined): void {
    if (this.paused.value) this.countMissed(state, event, true);
    else if (state.isHeld) this.countMissed(state, event, false);
    else this.triggerDirect(state, event);
  }

  // Leading and trailing: the first event of a quiet block reads at once, the
  // ones within the interval of a read collapse into one read when it ends,
  // so the last event of a burst is never lost.
  private triggerDirect(state: SubscriberState, event: object | undefined) {
    if (state.timer) {
      state.pendingEvents.push(event);
      return;
    }
    const wait = state.lastRunAt.value + this.intervalMs() - Date.now();
    if (wait <= 0) {
      this.run(state);
      return;
    }
    state.pendingEvents = [event];
    state.timer = setTimeout(() => this.run(state), wait);
  }

  private flushPending(state: SubscriberState, isPageMissed: boolean): void {
    if (!state.timer) return;
    const events = state.pendingEvents;
    clearTimer(state);
    for (const event of events) this.countMissed(state, event, isPageMissed);
  }

  private catchUp(state: SubscriberState): void {
    state.tally.reset();
    this.run(state);
  }

  private run(state: SubscriberState): void {
    this.markRead(state);
    state.refresh();
  }

  private markRead(state: SubscriberState): void {
    clearTimer(state);
    state.lastRunAt.value = Date.now();
    this.updatedAt.value = state.lastRunAt.value;
  }

  private countMissed(
    state: SubscriberState,
    event: object | undefined,
    isPageMissed: boolean,
  ): void {
    state.tally.add(event);
    if (isPageMissed) this.tally.add(event);
  }
}

function clearTimer(state: SubscriberState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.pendingEvents = [];
}

/**
 * The controller of a page declared with `live`. Starts paused when the URL
 * asks for it or the browser remembers the page (or its `rememberKey`) paused,
 * live otherwise.
 *
 * @internal
 */
export function createPageLiveController(
  pageId: string,
  options: PageLiveOptions,
  start?: PageLiveStart,
): PageLiveController {
  return new PageLive(pageId, options, start);
}
