// @vitest-environment jsdom
/**
 * A `liveHold` table on a paused live page keeps its rows: its events are
 * counted into a "N new · Show" banner, a source route is told when the rows
 * were frozen on every list it is asked for (the user's search, sort and
 * pagination included), and Show reads the rows once without leaving the
 * pause.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RealtimeTopicHandler } from "../layers/dms-core/app/composables/realtime/useUserRealtime";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import {
  LIVE_HELD_AT_QUERY_KEY,
  sourceRouteQuery,
} from "../layers/dms-ui/app/build/composables/table-view/useTableRows";
import type {
  TableLiveHold,
  TableLiveHoldSignals,
} from "../layers/dms-ui/app/build/composables/table-view/useTableLiveHold";
import type { TableViewLiveHoldOptions } from "../layers/dms-ui/app/types/live";

const topicHandlers = new Map<string, RealtimeTopicHandler>();

vi.mock("../layers/dms-core/app/composables/realtime/useRealtimeTopic", () => ({
  useRealtimeTopic: (topic: string, handler: RealtimeTopicHandler) => {
    topicHandlers.set(topic, handler);
  },
}));

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);
const { useTableLiveHold } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableLiveHold"
);

const TOPIC = "api:requests";
const tableViewSource = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/TableView.vue",
  ),
  "utf8",
);

let apps: App[] = [];
let live: PageLiveController;

const publish = () =>
  topicHandlers.get(TOPIC)?.({ topic: TOPIC, type: "request", ts: 1 });

interface MountedTableOptions {
  liveHold: boolean | TableViewLiveHoldOptions;
  isSource?: boolean;
  signals?: TableLiveHoldSignals;
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
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  apps.push(app);
  return { refresh, hold: hold! };
}

beforeEach(() => {
  vi.useFakeTimers();
  topicHandlers.clear();
  window.localStorage.clear();
  live = createPageLiveController("api.logs", {});
  setCurrentPageLive(live);
});

afterEach(() => {
  apps.forEach((app) => app.unmount());
  apps = [];
  live.dispose();
  setCurrentPageLive(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("holds the rows while paused and counts what came in", async () => {
  const { refresh, hold } = mountTable({ liveHold: true });
  expect(hold.isHolding.value).toBe(false);
  expect(hold.heldQuery()).toEqual({});

  live.pause();
  await nextTick();
  publish();
  publish();

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
  // The user's search while paused still lists the rows as they stood.
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
  publish();

  vi.setSystemTime(new Date("2026-10-11T08:02:00.000Z"));
  hold.showNew();

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(live.isPaused.value).toBe(true);
  expect(hold.newCount.value).toBe(0);
  expect(hold.heldQuery()).toEqual({
    [LIVE_HELD_AT_QUERY_KEY]: "2026-10-11T08:02:00.000Z",
  });

  // Nothing missed since Show: resuming has nothing to read again.
  live.resume();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("shows no banner count without liveHold, though it still pauses", async () => {
  const { refresh, hold } = mountTable({ liveHold: false });
  live.pause();
  await nextTick();
  publish();
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
  publish();

  vi.setSystemTime(new Date("2026-10-11T08:03:00.000Z"));
  refreshPageBlocks();

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(live.isPaused.value).toBe(true);
  expect(hold.newCount.value).toBe(0);
  expect(hold.heldQuery()).toEqual({
    [LIVE_HELD_AT_QUERY_KEY]: "2026-10-11T08:03:00.000Z",
  });
});

it("wires the table view's rows, row events and banner to the hold", () => {
  expect(tableViewSource).toMatch(
    /liveHold\?: boolean \| TableViewLiveHoldOptions;/,
  );
  expect(tableViewSource).toContain(
    "isRowOpen: () => openRowId.value !== undefined,",
  );
  expect(tableViewSource).toContain('ref="tableRoot"');
  expect(tableViewSource).toContain("heldQuery: liveHold.heldQuery,");
  expect(tableViewSource).toContain("refreshCallback: refreshByUser,");
  expect(tableViewSource).toContain('@refresh="refreshByUser"');
  expect(tableViewSource).toContain("gateRowEvent(payload.type, ids, event);");
  expect(tableViewSource).toMatch(
    /<LiveHoldBanner[\s\S]*@show="liveHold.showNew"/,
  );
});

it("holds the table alone while a row is open, the page staying live", async () => {
  const isRowOpen = ref(false);
  const { refresh, hold } = mountTable({
    liveHold: { whileRowOpen: true },
    signals: { isRowOpen: () => isRowOpen.value },
  });

  isRowOpen.value = true;
  await nextTick();
  publish();
  publish();
  expect(live.isPaused.value).toBe(false);
  expect(live.missedCount.value).toBe(0);
  expect(refresh).not.toHaveBeenCalled();
  expect(hold.isHolding.value).toBe(true);
  expect(hold.newCount.value).toBe(2);

  // Closing the panel reads what the table missed, once.
  isRowOpen.value = false;
  await nextTick();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(hold.isHolding.value).toBe(false);
  publish();
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("keeps today's hold when liveHold is true: an open row changes nothing", async () => {
  const { refresh, hold } = mountTable({
    liveHold: true,
    signals: { isRowOpen: () => true },
  });
  publish();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(hold.isHolding.value).toBe(false);
});

it("holds the table while its first row is scrolled out of view", async () => {
  const element = document.createElement("div");
  element.innerHTML = "<table><tbody><tr><td>1</td></tr></tbody></table>";
  document.body.append(element);
  const row = element.querySelector("tr")!;
  const rect = (bottom: number) => ({ bottom, top: bottom - 40 }) as DOMRect;
  row.getBoundingClientRect = () => rect(120);
  vi.stubGlobal("requestAnimationFrame", (run: () => void) =>
    setTimeout(run, 16),
  );
  const scroll = async () => {
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(16);
    await nextTick();
  };

  const { refresh, hold } = mountTable({
    liveHold: { whileScrolled: true },
    signals: { tableElement: () => element },
  });
  await nextTick();
  publish();
  expect(refresh).toHaveBeenCalledTimes(1);

  row.getBoundingClientRect = () => rect(-200);
  await scroll();
  publish();
  expect(hold.isHolding.value).toBe(true);
  expect(hold.newCount.value).toBe(1);
  expect(refresh).toHaveBeenCalledTimes(1);

  row.getBoundingClientRect = () => rect(120);
  await scroll();
  expect(refresh).toHaveBeenCalledTimes(2);
  element.remove();
});
