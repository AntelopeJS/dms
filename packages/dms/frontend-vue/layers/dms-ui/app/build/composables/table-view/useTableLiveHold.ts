import { computed, ref, watch, type ComputedRef } from "vue";
import { usePageLive } from "../../../composables/live/usePageLive";
import type { LiveGate } from "../live/currentPageLive";
import { LIVE_HELD_AT_QUERY_KEY } from "./useTableRows";

type Query = Record<string, unknown>;

export interface TableLiveHoldOptions {
  /** The table declares `liveHold`. */
  isEnabled: boolean;
  /** A `TableView.fromSource` table: its route receives the hold's bound. */
  isSource: boolean;
  /**
   * The table's refresh gate (useRefreshTriggers), read when used: the table
   * sets it up after the list this hold bounds.
   */
  gate: () => LiveGate;
}

export interface TableLiveHold {
  /** The rows are held: the table declares `liveHold` and the page is paused. */
  isHolding: ComputedRef<boolean>;
  /** Events the table received since its rows were held or last shown. */
  newCount: ComputedRef<number>;
  /** Reads the rows once, staying paused, and holds them from now. */
  showNew: () => void;
  /** The bound a source route receives with each request while held. */
  heldQuery: () => Query;
}

const NO_QUERY: Query = {};

/**
 * The `liveHold` of a table view: while its live page is paused, the table
 * keeps its rows — the gate already requests nothing on its events — and a
 * source route is told the moment they were frozen, so the user's own search,
 * sort and pagination list the rows as they stood. Show reads them once more
 * without leaving the pause.
 *
 * @internal
 */
export function useTableLiveHold(options: TableLiveHoldOptions): TableLiveHold {
  const { isEnabled, isPaused } = usePageLive();
  const heldAt = ref<string | null>(null);
  const isHolding = computed(
    () => options.isEnabled && isEnabled.value && isPaused.value,
  );

  watch(
    isHolding,
    (holding) => {
      heldAt.value = holding ? new Date().toISOString() : null;
    },
    { immediate: true },
  );

  return {
    isHolding,
    newCount: computed(() =>
      isHolding.value ? options.gate().missed.value : 0,
    ),
    showNew: () => {
      heldAt.value = new Date().toISOString();
      options.gate().catchUp();
    },
    heldQuery: () =>
      options.isSource && heldAt.value
        ? { [LIVE_HELD_AT_QUERY_KEY]: heldAt.value }
        : NO_QUERY,
  };
}
