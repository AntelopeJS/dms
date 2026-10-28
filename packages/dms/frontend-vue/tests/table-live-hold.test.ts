/** @vitest-environment jsdom */
/**
 * A `liveHold` table on a paused live page, or with its rows on screen, keeps
 * its rows: its events are counted into a "N new · Show" banner, a source route is told when the rows
 * were frozen on every list it is asked for (the user's search, sort and
 * pagination included), and Show reads the rows once without leaving the
 * pause.
 */
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  startTableRealtime,
  stopTableRealtime,
  publishTableEvent,
} from "./helpers/table-runtime";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/entries/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/entries/composables/live/currentPageLive";
import {
  LIVE_HELD_AT_QUERY_KEY,
  sourceRouteQuery,
} from "../layers/dms-ui/app/entries/composables/table-view/useTableRows";
import type {
  TableLiveHold,
  TableLiveHoldSignals,
  TableNewRowsCounter,
} from "../layers/dms-ui/app/entries/composables/table-view/useTableLiveHold";
import type { TableViewLiveHoldOptions } from "../layers/dms-core/app/types/live";

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/entries/composables/blocks/useRefreshTriggers"
);
const { useTableLiveHold } = await import(
  "../layers/dms-ui/app/entries/composables/table-view/useTableLiveHold"
);

const TOPIC = "api:requests";

let apps: App[] = [];
let live: PageLiveController;

const publish = () => publishTableEvent(TOPIC);

interface MountedTableOptions {
  liveHold: boolean | TableViewLiveHoldOptions;
  isSource?: boolean;
  signals?: TableLiveHoldSignals;
  newRows?: TableNewRowsCounter;
}

function mountTable(options: MountedTableOptions) {
  const refresh = vi.fn();
  let hold: TableLiveHold | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        const gate = useRefreshTriggers(TOPIC, refresh);
        hold = useTableLiveHold({
          liveHold: options.liveHold,
          isSource: options.isSource ?? true,
          gate: () => gate,
          signals: options.signals,
          newRows: options.newRows,
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  apps.push(app);
  return { refresh, hold: hold! };
}

beforeEach(async () => {
  vi.stubGlobal("isDmsHydrating", () => false);
  vi.useFakeTimers();
  await startTableRealtime();
  window.localStorage.clear();
  live = createPageLiveController("api.logs", {});
  setCurrentPageLive(live);
});

afterEach(async () => {
  apps.forEach((app) => app.unmount());
  apps = [];
  live.dispose();
  setCurrentPageLive(null);
  await stopTableRealtime();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("holds the rows while paused and counts what came in", async () => {
  const { refresh, hold } = mountTable({ liveHold: true });
  expect(hold.isHolding.value).toBe(false);
  expect(hold.heldQuery()).toEqual({});

  live.pause();
  await nextTick();
  await publish();
  await publish();

  expect(refresh).not.toHaveBeenCalled();
  expect(hold.isHolding.value).toBe(true);
  expect(hold.newCount.value).toBe(2);
});

it("bounds a source table's lists at the moment it was frozen", async () => {
  vi.setSystemTime(new Date("2026-10-11T08:00:00.000Z"));
  const { hold } = mountTable({ liveHold: true });
  live.pause();
  await nextTick();

  vi.setSystemTime(new Date("2026-10-11T08:05:00.000Z"));

  expect(hold.heldQuery()).toEqual({
    [LIVE_HELD_AT_QUERY_KEY]: "2026-10-11T08:00:00.000Z",
  });

  live.resume();
  await nextTick();
  expect(hold.heldQuery()).toEqual({});
});

it("sends no bound to a data controller's list", async () => {
  const { hold } = mountTable({ liveHold: true, isSource: false });
  live.pause();
  await nextTick();
  expect(hold.heldQuery()).toEqual({});
});

it("shows what is new once, staying paused, and holds from then", async () => {
  vi.setSystemTime(new Date("2026-10-11T08:00:00.000Z"));
  const { refresh, hold } = mountTable({ liveHold: true });
  live.pause();
  await nextTick();
  await publish();

  vi.setSystemTime(new Date("2026-10-11T08:02:00.000Z"));
  hold.showNew();

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(live.isPaused.value).toBe(true);
  expect(hold.newCount.value).toBe(0);
  expect(hold.heldQuery()).toEqual({
    [LIVE_HELD_AT_QUERY_KEY]: "2026-10-11T08:02:00.000Z",
  });

  live.resume();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("shows no banner count without liveHold, though it still pauses", async () => {
  const { refresh, hold } = mountTable({ liveHold: false });
  live.pause();
  await nextTick();
  await publish();
  expect(refresh).not.toHaveBeenCalled();
  expect(hold.newCount.value).toBe(0);
  expect(hold.heldQuery()).toEqual({});

  live.resume();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("lets the bound through to a source route whatever its capabilities", () => {
  expect(
    sourceRouteQuery(
      { [LIVE_HELD_AT_QUERY_KEY]: "2026-10-11T08:00:00.000Z", search: "x" },
      {},
    ),
  ).toEqual({ [LIVE_HELD_AT_QUERY_KEY]: "2026-10-11T08:00:00.000Z" });
});

it("reads on a user's refresh while held, and holds from then", async () => {
  vi.setSystemTime(new Date("2026-10-11T08:00:00.000Z"));
  const { refresh, hold } = mountTable({ liveHold: true });
  live.pause();
  await nextTick();
  await publish();

  vi.setSystemTime(new Date("2026-10-11T08:03:00.000Z"));
  refreshPageBlocks();

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(live.isPaused.value).toBe(true);
  expect(hold.newCount.value).toBe(0);
  expect(hold.heldQuery()).toEqual({
    [LIVE_HELD_AT_QUERY_KEY]: "2026-10-11T08:03:00.000Z",
  });
});

it("holds the table alone while a row is open, the page staying live", async () => {
  const isRowOpen = ref(false);
  const { refresh, hold } = mountTable({
    liveHold: { whileRowOpen: true },
    signals: { isRowOpen: () => isRowOpen.value },
  });

  isRowOpen.value = true;
  await nextTick();
  await publish();
  await publish();
  expect(live.isPaused.value).toBe(false);
  expect(live.missedCount.value).toBe(0);
  expect(refresh).not.toHaveBeenCalled();
  expect(hold.isHolding.value).toBe(true);
  expect(hold.newCount.value).toBe(2);

  isRowOpen.value = false;
  await nextTick();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(hold.isHolding.value).toBe(false);
  await publish();
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("keeps today's hold when liveHold is true: an open row changes nothing", async () => {
  const { refresh, hold } = mountTable({
    liveHold: true,
    signals: { isRowOpen: () => true },
  });
  await publish();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(hold.isHolding.value).toBe(false);
});

function placedTable(tableTop: number, rowBottom: number) {
  const element = document.createElement("div");
  element.innerHTML = "<table><tbody><tr><td>1</td></tr></tbody></table>";
  document.body.append(element);
  const row = element.querySelector("tr")!;
  const place = (top: number, bottom: number) => {
    element.getBoundingClientRect = () => new DOMRect(0, top, 0, 400);
    row.getBoundingClientRect = () => new DOMRect(0, bottom - 40, 0, 40);
  };
  place(tableTop, rowBottom);
  vi.stubGlobal("requestAnimationFrame", (run: () => void) =>
    setTimeout(run, 16),
  );
  const scroll = async (top: number, bottom: number) => {
    place(top, bottom);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(16);
    await nextTick();
  };
  return { element, scroll };
}

it("holds the rows on screen still, the page staying live, without a reason", async () => {
  const { element, scroll } = placedTable(80, 160);
  const { refresh, hold } = mountTable({
    liveHold: true,
    signals: { tableElement: () => element },
  });
  await nextTick();
  await publish();
  await publish();
  expect(live.isPaused.value).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
  expect(hold.isHolding.value).toBe(true);
  expect(hold.newCount.value).toBe(2);
  expect(hold.reason.value).toBe(null);

  await scroll(1200, 1280);
  expect(refresh).toHaveBeenCalledTimes(1);
  await publish();
  expect(refresh).toHaveBeenCalledTimes(2);
  element.remove();
});

it("names the scroll as its reason while its first row is out of view", async () => {
  const { element, scroll } = placedTable(80, 160);
  const { refresh, hold } = mountTable({
    liveHold: { whileScrolled: true },
    signals: { tableElement: () => element },
  });
  await nextTick();
  await publish();
  expect(refresh).not.toHaveBeenCalled();
  expect(hold.reason.value).toBe(null);

  await scroll(-400, -200);
  await publish();
  expect(hold.reason.value).toBe("scrolled");
  expect(hold.newCount.value).toBe(2);
  expect(refresh).not.toHaveBeenCalled();
  element.remove();
});

it("holds the table alone while searching or sorted, saying why", async () => {
  const isSearching = ref(false);
  const isSorted = ref(false);
  const isRowOpen = ref(false);
  const { refresh, hold } = mountTable({
    liveHold: { whileSearching: true, whileSorted: true, whileRowOpen: true },
    signals: {
      isSearching: () => isSearching.value,
      isSorted: () => isSorted.value,
      isRowOpen: () => isRowOpen.value,
    },
  });
  expect(hold.reason.value).toBe(null);

  isSorted.value = true;
  await nextTick();
  await publish();
  expect(refresh).not.toHaveBeenCalled();
  expect(hold.reason.value).toBe("sorted");

  isSearching.value = true;
  await nextTick();
  expect(hold.reason.value).toBe("searching");

  isRowOpen.value = true;
  await nextTick();
  expect(hold.reason.value).toBe("rowOpen");

  live.pause();
  await nextTick();
  expect(hold.isHolding.value).toBe(true);
  expect(hold.reason.value).toBe(null);
});

it("holds for no search nor sort the options leave off", async () => {
  const { refresh, hold } = mountTable({
    liveHold: { whileRowOpen: true },
    signals: { isSearching: () => true, isSorted: () => true },
  });
  await publish();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(hold.reason.value).toBe(null);
});

it("hands the strip the paused page's breakdown and the table's missedLabel", async () => {
  const isRowOpen = ref(false);
  const { hold } = mountTable({
    liveHold: { whileRowOpen: true, missedLabel: "$api.live.new_requests" },
    signals: { isRowOpen: () => isRowOpen.value },
  });
  expect(hold.missedLabel).toBe("$api.live.new_requests");
  const detail = { text: "$api.live.in_5xx", params: { count: 1 } };

  isRowOpen.value = true;
  await nextTick();
  await publish();
  live.setMissedDetail(detail);
  expect(hold.missedDetail.value).toBe(null);

  live.pause();
  await nextTick();
  await publish();
  live.setMissedDetail(detail);
  expect(hold.missedDetail.value).toEqual(detail);

  live.resume();
  await nextTick();
  expect(hold.missedDetail.value).toBe(null);
});

function countedRows(held: number, now: () => number | Promise<number>) {
  const heldList = ref<{ total: number } | null>({ total: held });
  const countNow = vi.fn(async () => now());
  return { heldList, newRows: { heldList: () => heldList.value, countNow } };
}

it("counts the new rows the table would list, not every event", async () => {
  const { newRows } = countedRows(10, () => 11);
  const { hold } = mountTable({ liveHold: true, newRows });
  live.pause();
  await nextTick();
  await publish();
  await publish();
  await publish();
  await nextTick();
  expect(hold.newCount.value).toBe(0);

  await vi.advanceTimersByTimeAsync(500);
  expect(newRows.countNow).toHaveBeenCalledTimes(1);
  expect(hold.newCount.value).toBe(1);
});

it("shows no pill when no new event matches the table's query", async () => {
  const { newRows } = countedRows(10, () => 10);
  const { hold } = mountTable({ liveHold: true, newRows });
  live.pause();
  await nextTick();
  await publish();
  await vi.advanceTimersByTimeAsync(500);
  expect(hold.newCount.value).toBe(0);
});

it("counts again when the held list changes, and forgets on Show", async () => {
  let now = 12;
  const { heldList, newRows } = countedRows(10, () => now);
  const { hold } = mountTable({ liveHold: true, newRows });
  live.pause();
  await nextTick();
  await publish();
  await vi.advanceTimersByTimeAsync(500);
  expect(hold.newCount.value).toBe(2);

  heldList.value = { total: 3 };
  now = 4;
  await nextTick();
  await vi.advanceTimersByTimeAsync(500);
  expect(hold.newCount.value).toBe(1);

  hold.showNew();
  await nextTick();
  expect(hold.newCount.value).toBe(0);
});

it("falls back to the events when the count fails", async () => {
  const { newRows } = countedRows(10, () => Promise.reject(new Error("503")));
  const { hold } = mountTable({ liveHold: true, newRows });
  live.pause();
  await nextTick();
  await publish();
  await publish();
  await vi.advanceTimersByTimeAsync(500);
  expect(hold.newCount.value).toBe(2);
});
