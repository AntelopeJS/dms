// @vitest-environment jsdom
/**
 * A `TableView.fromSource` table whose `fetchUrl` reads the page query lists
 * again when a link changes that query, through the runtime's real async data
 * cache: whether the link keeps the page mounted (the watch) or remounts it
 * (a fresh instance binding to the cached entry of its key).
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsFrontendRuntime } from "#dms/frontend-module";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
vi.stubGlobal("useDmsLazyAsyncData", engine.useDmsLazyAsyncData);

const { useTableRows } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableRows"
);
const { useTableCountsData, useTableListData } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableListData"
);

const FETCH_URL = "/api/log/route?route={{query.route}}";
const COLUMNS = [{ id: "path", accessorKey: "path" }] as TableViewColumn[];
const TAB_QUERIES = [{ id: "get", query: { filter_method: "is:GET" } }];
const ROUTE_VALUE = "GET /api/search?q=shoes&page=2";
const ENCODED_URL =
  "/api/log/route?route=GET%20%2Fapi%2Fsearch%3Fq%3Dshoes%26page%3D2";

type Api = Parameters<typeof useTableRows>[0]["api"];

const requests: string[] = [];
const api = (async (url: string) => {
  requests.push(url);
  return { results: [{ _id: "a", path: "/api/search" }], total: 1 };
}) as unknown as Api;

let runtime: DmsFrontendRuntime;
const mounted: App[] = [];

const SourceTable = defineComponent({
  setup() {
    const route = runtime.route;
    const rows = useTableRows({
      api,
      location: FETCH_URL,
      source: { fetchUrl: FETCH_URL, capabilities: { filter: true } },
      columns: COLUMNS,
      route: () => ({ routeParams: {}, routeQuery: route.query }),
    });
    const archiveQuery = computed(() => ({}));
    const keys = { componentId: "requests", pageId: "sources", rows };
    void useTableListData({
      ...keys,
      query: computed(() => ({ offset: 0, limit: 10 })),
      archiveQuery,
      isSelfManaged: computed(() => false),
    });
    void useTableCountsData({
      ...keys,
      queries: computed(() => TAB_QUERIES),
      archiveQuery,
    });
    return () => h("div");
  },
});

function mountTable(): void {
  const app = createApp(SourceTable);
  engine.provideDmsFrontendRuntime(app, runtime);
  app.mount(document.createElement("div"));
  mounted.push(app);
}

const settle = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  requests.length = 0;
  runtime = engine.createDmsFrontendRuntime();
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("a source table following the page query", () => {
  it("requests nothing while the query value is missing", async () => {
    mountTable();
    await settle();
    expect(requests).toEqual([]);
  });

  it("lists again when the page stays mounted", async () => {
    mountTable();
    await settle();
    runtime.route.query = { route: ROUTE_VALUE };
    await settle();
    expect(requests).toEqual([ENCODED_URL, ENCODED_URL]);
  });

  // An Inertia link without preserveState remounts the page: the new table
  // reads the new query from its first render, so its URL never changes.
  it("lists again when the link remounts the page", async () => {
    mountTable();
    await settle();
    mounted.pop()?.unmount();
    runtime.route.query = { route: ROUTE_VALUE };
    mountTable();
    await settle();
    expect(requests).toEqual([ENCODED_URL, ENCODED_URL]);
  });
});
