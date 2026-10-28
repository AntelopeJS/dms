import {
  computed,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
} from "vue";
import { usePageLive } from "../../../composables/live/usePageLive";
import type {
  PageLiveNote,
  TableViewLiveHoldOptions,
} from "#dms-core/app/types/live";
import type { LiveGate } from "../live/currentPageLive";
import { useScrolledPastTop, useTableReached } from "./useScrolledPastTop";
import { LIVE_HELD_AT_QUERY_KEY, type TableCountQuery } from "./useTableRows";

type Query = TableCountQuery["query"];

/** What the table tells its hold about the user's reading. */
export interface TableLiveHoldSignals {
  /** One of its rows is open in the side panel. */
  isRowOpen?: () => boolean;
  /** The user's search narrows the rows. */
  isSearching?: () => boolean;
  /** The rows are sorted otherwise than by the table's default. */
  isSorted?: () => boolean;
  /**
   * The table's element: whether it is on screen, and where its first row
   * stands for `whileScrolled`.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The resolver may return unparsed or missing element refs. useLocalHold accepts only HTMLElement instances and treats other values as absent; an HTMLElement-only contract would exclude those existing fallback cases.
  tableElement?: () => unknown;
}

/** Why a table holds its rows by itself, its page staying live. */
export type TableLiveHoldReason =
  | "rowOpen"
  | "searching"
  | "sorted"
  | "scrolled";

/**
 * A table holds by itself for a reason it names, or because the user has its
 * rows on screen (`reading`): new rows would push them down. The latter goes
 * unsaid; the new rows wait behind the "N new · Show" pill.
 */
type LocalHoldReason = TableLiveHoldReason | "reading";

/**
 * How a held table counts the new rows it would show: the rows its current
 * query (tab, search, filters) matches now, less the rows it holds. Without
 * it the pill counts every event of the table's topic, whatever row each
 * one is about.
 */
export interface TableNewRowsCounter {
  /**
   * The list on screen, `null` before it arrives; read again whenever it
   * changes (a new read, another query), which counts again.
   */
  heldList: () => { total: number } | null | undefined;
  /** How many rows the table's current query matches now, unbounded. */
  countNow: (signal: AbortSignal) => Promise<number | undefined>;
}

export interface TableLiveHoldOptions {
  /** The table's `liveHold`: `true` or an object enables it. */
  liveHold: boolean | TableViewLiveHoldOptions | undefined;
  /** A `TableView.fromSource` table: its route receives the hold's bound. */
  isSource: boolean;
  /**
   * The table's refresh gate (useRefreshTriggers), read when used: the table
   * sets it up after the list this hold bounds.
   */
  gate: () => LiveGate;
  signals?: TableLiveHoldSignals;
  newRows?: TableNewRowsCounter;
}

export interface TableLiveHold {
  /** The rows are held: the page is paused, or the table holds by itself. */
  isHolding: ComputedRef<boolean>;
  /**
   * The rows the table would add since its rows were held or last shown
   * (`newRows`), or else the events it received meanwhile.
   */
  newCount: ComputedRef<number>;
  /**
   * Why the table holds by itself while its page is live, `null` otherwise:
   * a paused page says why on its toggle.
   */
  reason: ComputedRef<TableLiveHoldReason | null>;
  /** What the new rows are called, given `{count}` (`liveHold.missedLabel`). */
  missedLabel: string | undefined;
  /**
   * The breakdown of what the paused page missed (`setMissedDetail`), `null`
   * while the page is live or nothing came in.
   */
  missedDetail: ComputedRef<PageLiveNote | null>;
  /** Reads the rows once, staying held, and holds them from now. */
  showNew: () => void;
  /** The bound a source route receives with each request while held. */
  heldQuery: () => Query;
}

const NO_QUERY: Query = {};
const NEVER = () => false;
const NO_ELEMENT = () => null;

function holdOptionsOf(
  liveHold: TableLiveHoldOptions["liveHold"],
): TableViewLiveHoldOptions | null {
  if (!liveHold) return null;
  return liveHold === true ? {} : liveHold;
}

function useLocalHold(
  holdOptions: TableViewLiveHoldOptions | null,
  signals: TableLiveHoldSignals,
): ComputedRef<LocalHoldReason | null> {
  const tableElement = signals.tableElement ?? NO_ELEMENT;
  const element = () => {
    const target = tableElement();
    return target instanceof HTMLElement ? target : null;
  };
  const isScrolled = useScrolledPastTop(element, !!holdOptions?.whileScrolled);
  const isReached = useTableReached(element, !!holdOptions);
  const reasons: Array<[LocalHoldReason, boolean, () => boolean]> = [
    ["rowOpen", !!holdOptions?.whileRowOpen, signals.isRowOpen ?? NEVER],
    ["searching", !!holdOptions?.whileSearching, signals.isSearching ?? NEVER],
    ["sorted", !!holdOptions?.whileSorted, signals.isSorted ?? NEVER],
    ["scrolled", !!holdOptions?.whileScrolled, () => isScrolled.value],
    ["reading", !!holdOptions, () => isReached.value],
  ];
  return computed(
    () =>
      reasons.find(([, isEnabled, isActive]) => isEnabled && isActive())?.[0] ??
      null,
  );
}

/**
 * The `liveHold` of a table view: while its live page is paused, while its
 * rows are on screen or scrolled past (rows landing at the top would move
 * them) — or, with `whileRowOpen` / `whileSearching` / `whileSorted` /
 * `whileScrolled`, saying so, while the user reads a row, searches, sorts or
 * scrolled down — the table keeps its rows: the gate requests nothing on its events and counts them, and a
 * source route is told the moment they were frozen, so the user's own
 * search, sort and pagination list the rows as they stood.
 * Show reads them once more without leaving the hold; the end of a hold of
 * the table's own reads them if it missed any.
 *
 * @internal
 */
export function useTableLiveHold(options: TableLiveHoldOptions): TableLiveHold {
  const { isEnabled, isPaused, missedDetail } = usePageLive();
  const holdOptions = holdOptionsOf(options.liveHold);
  const localReason = useLocalHold(holdOptions, options.signals ?? {});
  const isLocallyHeld = computed(() => localReason.value !== null);
  const isHolding = computed(
    () =>
      !!holdOptions &&
      isEnabled.value &&
      (isPaused.value || isLocallyHeld.value),
  );

  watch(
    [isLocallyHeld, isEnabled],
    ([held, enabled]) => {
      if (enabled) options.gate().setHeld(held);
    },
    { flush: "sync" },
  );
  const missed = () => (isHolding.value ? options.gate().missed.value : 0);
  const newCount = options.newRows
    ? useCountedNewRows(missed, options.newRows)
    : computed(missed);

  return {
    isHolding,
    newCount,
    reason: computed(() => {
      if (!isHolding.value || isPaused.value) return null;
      const reason = localReason.value;
      return reason === "reading" ? null : reason;
    }),
    missedLabel: holdOptions?.missedLabel,
    missedDetail: computed(() =>
      isPaused.value && newCount.value > 0 ? missedDetail.value : null,
    ),
    showNew: () => options.gate().catchUp(),
    heldQuery: useHeldQuery(isHolding, options),
  };
}

/** Lets a burst of events through before counting the new rows once. */
const NEW_ROWS_COUNT_DELAY_MS = 500;

function useCountedNewRows(
  missed: () => number,
  counter: TableNewRowsCounter,
): ComputedRef<number> {
  const counted = ref(0);
  const hasFailed = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | undefined;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    inFlight?.abort();
    inFlight = undefined;
  };
  const count = async () => {
    timer = undefined;
    const held = counter.heldList()?.total;
    if (held === undefined) return;
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    try {
      const now = await counter.countNow(controller.signal);
      if (controller.signal.aborted) return;
      hasFailed.value = now === undefined;
      counted.value = Math.max(0, (now ?? held) - held);
    } catch {
      if (!controller.signal.aborted) hasFailed.value = true;
    }
  };

  const scope = getCurrentScope();
  const follow = () =>
    watch(
      [missed, counter.heldList],
      ([events]) => {
        if (events === 0) {
          cancel();
          counted.value = 0;
          hasFailed.value = false;
          return;
        }
        timer ??= setTimeout(count, NEW_ROWS_COUNT_DELAY_MS);
      },
      { immediate: true },
    );
  onMounted(() => scope?.run(follow));
  onScopeDispose(cancel);

  return computed(() => {
    const events = missed();
    if (events === 0) return 0;
    return hasFailed.value ? events : counted.value;
  });
}

function useHeldQuery(
  isHolding: ComputedRef<boolean>,
  options: TableLiveHoldOptions,
): () => Query {
  const pausedAt = ref<number | null>(null);
  watch(
    isHolding,
    (holding) => {
      pausedAt.value = holding ? Date.now() : null;
    },
    { immediate: true },
  );
  return () => {
    if (!options.isSource || pausedAt.value === null) return NO_QUERY;
    const at = Math.max(pausedAt.value, options.gate().lastReadAt.value);
    return { [LIVE_HELD_AT_QUERY_KEY]: new Date(at).toISOString() };
  };
}
