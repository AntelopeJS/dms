// @vitest-environment jsdom
/**
 * The requests behind a table view's list and counters, through the
 * runtime's real async data: a query rebuilt equal by value reads nothing
 * again, one that changes reads again, and each request carries the run's
 * abort signal, so a run replaced or dropped cancels its request.
 */
import { computed, createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("computed", computed);
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);

const { useTableRows } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableRows"
);
const { useTableCountsData, useTableListData } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableListData"
);

const LOCATION = "/api/orders";
const COLUMNS = [{ id: "total", accessorKey: "total" }] as TableViewColumn[];

interface Call {
  url: string;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}

const calls: Call[] = [];
const api = (async (url: string, options: Omit<Call, "url"> = {}) => {
  calls.push({ url, ...options });
  return url.endsWith("/count/batch")
    ? { all: 1 }
    : { results: [], total: 0, offset: 0, limit: 10 };
}) as never;

const unmounts: Array<() => void> = [];

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function settle() {
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
  await nextTick();
}

/** A table whose query is rebuilt on each `tick`, to `limit`'s value. */
async function mountTable() {
  const tick = ref(0);
  const limit = ref(10);
  const Table = defineComponent({
    setup() {
      const rows = useTableRows({ api, location: LOCATION, columns: COLUMNS });
      const keys = { componentId: "orders", pageId: "sales", rows };
      const archiveQuery = computed(() => (void tick.value, {}));
      useTableListData({
        ...keys,
        query: computed(() => (void tick.value, { limit: limit.value })),
        archiveQuery,
        isSelfManaged: computed(() => false),
      });
      useTableCountsData({
        ...keys,
        queries: computed(() => (void tick.value, [{ id: "all", query: {} }])),
        archiveQuery,
      });
      return () => h("i");
    },
  });
  const app = createApp(Table);
  engine.provideDmsFrontendRuntime(
    app,
    engine.createDmsFrontendRuntime(undefined, {}),
  );
  app.mount(document.createElement("div"));
  unmounts.push(() => app.unmount());
  await settle();
  return { tick, limit };
}

describe("a table view's list and counters", () => {
  it("read nothing again for a query rebuilt equal", async () => {
    const { tick } = await mountTable();
    expect(calls.map(({ url }) => url).sort()).toEqual([
      `${LOCATION}/count/batch`,
      `${LOCATION}/list`,
    ]);
    calls.length = 0;

    tick.value += 1;
    await settle();

    expect(calls).toEqual([]);
  });

  it("read the list again for a query that changes", async () => {
    const { limit } = await mountTable();
    calls.length = 0;

    limit.value = 20;
    await settle();

    expect(calls.map(({ url, query }) => [url, query?.limit])).toEqual([
      [`${LOCATION}/list`, 20],
    ]);
  });

  it("send each request with its run's abort signal", async () => {
    await mountTable();

    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("a source table's requests", () => {
  const source = {
    fetchUrl: "/api/report",
    capabilities: {
      filter: false,
      search: false,
      sort: false,
      paginate: false,
    },
  };

  const filterable = {
    ...source,
    capabilities: { ...source.capabilities, filter: true },
  };

  it("ask the route once when the list and a counter ask the same", async () => {
    const Table = defineComponent({
      setup() {
        const rows = useTableRows({
          api,
          location: LOCATION,
          columns: COLUMNS,
          source: filterable as never,
        });
        const keys = { componentId: "report", pageId: "stats", rows };
        const archiveQuery = computed(() => ({}));
        useTableListData({
          ...keys,
          query: computed(() => ({ limit: 10, offset: 0 })),
          archiveQuery,
          isSelfManaged: computed(() => false),
        });
        useTableCountsData({
          ...keys,
          queries: computed(() => [
            { id: "all", query: {} },
            { id: "open", query: { filter_status: "is:open" } },
          ]),
          archiveQuery,
        });
        return () => h("i");
      },
    });
    const app = createApp(Table);
    engine.provideDmsFrontendRuntime(
      app,
      engine.createDmsFrontendRuntime(undefined, {}),
    );
    app.mount(document.createElement("div"));
    unmounts.push(() => app.unmount());
    await settle();

    // The route pages nothing: the list and the "all" counter both read
    // every row, the same request.
    expect(
      calls.map(({ url, query }) => [url, query?.filter_status]).sort(),
    ).toEqual([
      ["/api/report", undefined],
      ["/api/report", "is:open"],
    ]);
  });

  /** A route answering only when `answer` is called. */
  function pendingApi() {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const held = (async (url: string, options: Omit<Call, "url"> = {}) => {
      calls.push({ url, ...options });
      await answered;
      return { results: [{ total: 1 }], total: 1 };
    }) as never;
    return { held, answer };
  }

  it("keep a shared request while a caller still waits on it", async () => {
    const { held, answer } = pendingApi();
    const rows = useTableRows({
      api: held,
      location: LOCATION,
      columns: COLUMNS,
      source: source as never,
    });
    const listing = new AbortController();
    const counting = new AbortController();
    const list = rows.list({}, listing.signal);
    const counts = rows.countBatch(
      [{ id: "all", query: {} }],
      counting.signal,
    );
    listing.abort();
    answer();

    await expect(list).rejects.toBeDefined();
    await expect(counts).resolves.toEqual({ all: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal?.aborted).toBe(false);
  });

  it("cancel the request once every caller gave up", async () => {
    const { held } = pendingApi();
    const rows = useTableRows({
      api: held,
      location: LOCATION,
      columns: COLUMNS,
      source: source as never,
    });
    const listing = new AbortController();
    const counting = new AbortController();
    const list = rows.list({}, listing.signal);
    const counts = rows.countBatch(
      [{ id: "all", query: {} }],
      counting.signal,
    );
    listing.abort();
    expect(calls[0]!.signal?.aborted).toBe(false);
    counting.abort();

    await expect(list).rejects.toBeDefined();
    await expect(counts).rejects.toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal?.aborted).toBe(true);
  });
});
