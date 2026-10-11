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
import { createApp, defineComponent, h, nextTick, type App } from "vue";
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
import type { TableLiveHold } from "../layers/dms-ui/app/build/composables/table-view/useTableLiveHold";

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

function mountTable(options: { liveHold: boolean; isSource?: boolean }) {
  const refresh = vi.fn();
  let hold: TableLiveHold | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        const gate = useRefreshTriggers(TOPIC, refresh);
        hold = useTableLiveHold({
          isEnabled: options.liveHold,
          isSource: options.isSource ?? true,
          gate: () => gate,
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
  expect(tableViewSource).toMatch(/liveHold\?: boolean;/);
  expect(tableViewSource).toContain("heldQuery: liveHold.heldQuery,");
  expect(tableViewSource).toContain("refreshCallback: refreshByUser,");
  expect(tableViewSource).toContain('@refresh="refreshByUser"');
  expect(tableViewSource).toContain("gateRowEvent(payload.type, ids, event);");
  expect(tableViewSource).toMatch(
    /<LiveHoldBanner[\s\S]*@show="liveHold.showNew"/,
  );
});
