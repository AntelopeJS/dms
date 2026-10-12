import { computed, ref, watch, type ComputedRef } from "vue";
import { usePageLive } from "../../../composables/live/usePageLive";
import type {
  PageLiveNote,
  TableViewLiveHoldOptions,
} from "../../../types/live";
import type { LiveGate } from "../live/currentPageLive";
import { useScrolledPastTop } from "./useScrolledPastTop";
import { LIVE_HELD_AT_QUERY_KEY } from "./useTableRows";

type Query = Record<string, unknown>;

/** What the table tells its hold about the user's reading. */
export interface TableLiveHoldSignals {
  /** One of its rows is open in the side panel. */
  isRowOpen?: () => boolean;
  /** The user's search narrows the rows. */
  isSearching?: () => boolean;
  /** The rows are sorted otherwise than by the table's default. */
  isSorted?: () => boolean;
  /** The table's element, whose first row `whileScrolled` follows. */
  tableElement?: () => unknown;
}

/** Why a table holds its rows by itself, its page staying live. */
export type TableLiveHoldReason =
  | "rowOpen"
  | "searching"
  | "sorted"
  | "scrolled";

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
}

export interface TableLiveHold {
  /** The rows are held: the page is paused, or the table holds by itself. */
  isHolding: ComputedRef<boolean>;
  /** Events the table received since its rows were held or last shown. */
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

// The table alone holds while the page is live: the user reads a row in the
// side panel, narrows or reorders the rows, or reads further down than the
// rows that would move. The first reason in this order is the one shown.
function useLocalHold(
  holdOptions: TableViewLiveHoldOptions | null,
  signals: TableLiveHoldSignals,
): ComputedRef<TableLiveHoldReason | null> {
  const tableElement = signals.tableElement ?? NO_ELEMENT;
  const isScrolled = useScrolledPastTop(() => {
    const element = tableElement();
    return element instanceof HTMLElement ? element : null;
  }, !!holdOptions?.whileScrolled);
  const reasons: Array<[TableLiveHoldReason, boolean, () => boolean]> = [
    ["rowOpen", !!holdOptions?.whileRowOpen, signals.isRowOpen ?? NEVER],
    ["searching", !!holdOptions?.whileSearching, signals.isSearching ?? NEVER],
    ["sorted", !!holdOptions?.whileSorted, signals.isSorted ?? NEVER],
    ["scrolled", !!holdOptions?.whileScrolled, () => isScrolled.value],
  ];
  return computed(
    () =>
      reasons.find(([, isEnabled, isActive]) => isEnabled && isActive())?.[0] ??
      null,
  );
}

/**
 * The `liveHold` of a table view: while its live page is paused — or, with
 * `whileRowOpen` / `whileSearching` / `whileSorted` / `whileScrolled`, while
 * the user reads a row, searches, sorts or scrolled down — the table keeps
 * its rows: the gate requests nothing on its events and counts them, and a
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
  // Again on a new controller: the gate binds to the page on screen.
  watch(
    [isLocallyHeld, isEnabled],
    ([held, enabled]) => {
      if (enabled) options.gate().setHeld(held);
    },
    { flush: "sync" },
  );
  const newCount = computed(() =>
    isHolding.value ? options.gate().missed.value : 0,
  );

  return {
    isHolding,
    newCount,
    reason: computed(() =>
      isHolding.value && !isPaused.value ? localReason.value : null,
    ),
    missedLabel: holdOptions?.missedLabel,
    missedDetail: computed(() =>
      isPaused.value && newCount.value > 0 ? missedDetail.value : null,
    ),
    showNew: () => options.gate().catchUp(),
    heldQuery: useHeldQuery(isHolding, options),
  };
}

// The bound a source route receives while the rows are held: they are as
// fresh as the hold, or as the last read the user asked for since (Show, an
// action of theirs).
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
