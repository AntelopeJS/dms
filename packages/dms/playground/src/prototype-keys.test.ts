import assert from "node:assert/strict";
import { test } from "node:test";
import { BlocksDemoApiController } from "./blocks/api";
import { BlocksFeedApiController } from "./blocks/feed-api";
import { BlocksGuardApiController } from "./blocks/guard-api";
import { BlocksLiveApiController } from "./blocks/live-api";
import { CardsDemoApiController } from "./chart/api/cards";
import { DashboardApiController } from "./chart/api/dashboard";
import { TopListDemoApiController } from "./chart/api/top-lists";
import { filterEntries } from "./table-view/request-log/api";

const PROTOTYPE_KEYS = [
  "constructor",
  "toString",
  "hasOwnProperty",
  "__proto__",
];
const UNKNOWN_KEY = "no-such-preset";

/** A lookup keyed by caller text answers a prototype key as it answers an unknown one. */
function assertKeysAreUnknown(
  name: string,
  ask: (key: string) => object | Promise<object>,
): Promise<void> {
  return test(name, async () => {
    const fallback = await ask(UNKNOWN_KEY);
    for (const key of PROTOTYPE_KEYS) {
      assert.deepEqual(await ask(key), fallback, `the key ${key}`);
    }
  });
}

const blocks = new BlocksDemoApiController();
const feed = new BlocksFeedApiController();
const guard = new BlocksGuardApiController();
const live = new BlocksLiveApiController();
const cards = new CardsDemoApiController();
const dashboard = new DashboardApiController();
const topLists = new TopListDemoApiController();

/** Resolves when every case has run. */
export const settled = Promise.all([
  assertKeysAreUnknown("blocks stats preset", (key) => blocks.getStats(key)),
  assertKeysAreUnknown("blocks period facts preset", (key) =>
    blocks.getPeriodFacts(key),
  ),
  assertKeysAreUnknown("feed attention count", async (key) => ({
    count: (await feed.getAttention(key)).count,
  })),
  assertKeysAreUnknown("feed quota preset", (key) => feed.getQuota(key)),
  assertKeysAreUnknown("guard calls preset", (key) => guard.getCalls(key)),
  assertKeysAreUnknown("guard calls kpi preset", (key) =>
    guard.getCallsKpi(key),
  ),
  assertKeysAreUnknown("guard calls series preset", (key) =>
    guard.getCallsSeries(key),
  ),
  assertKeysAreUnknown("live stats values", async (key) => ({
    values: (await live.getStats(key)).items.map((item) => item.value),
  })),
  assertKeysAreUnknown("card channels preset", (key) => cards.getChannels(key)),
  assertKeysAreUnknown("card latency preset", (key) => cards.getLatency(key)),
  assertKeysAreUnknown("top list route preset", (key) =>
    topLists.getRoutes(key),
  ),
  assertKeysAreUnknown("dashboard kpi preset", (key) =>
    dashboard.getKpi("revenue", key),
  ),
  assertKeysAreUnknown("dashboard kpi metric", (key) =>
    dashboard.getKpi(key, "this-month"),
  ),
  assertKeysAreUnknown("request log filter mode", (key) => ({
    rows: filterEntries(new URLSearchParams(`filter_method=${key}:GET`)),
  })),
]);
