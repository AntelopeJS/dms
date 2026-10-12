// @vitest-environment jsdom
/**
 * A `TableView.fromSource` table with a `periodScope` follows its
 * PeriodSelector like a chart: its route is sent the period, it lists again
 * when the period changes, and it requests nothing (keeping its skeleton)
 * until the selector has registered the scope.
 */
import {
  computed,
  createApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const { usePeriod } = await import(
  "../layers/dms-core/app/composables/period/usePeriod"
);
const { registerPeriodScope } = await import(
  "../layers/dms-core/app/composables/period/usePeriodScope"
);

const SCOPE = "report";
const FETCH_URL = "/api/report";
const COLUMNS = [{ id: "name", accessorKey: "name" }] as TableViewColumn[];

type Api = Parameters<typeof useTableRows>[0]["api"];

const requests: string[] = [];
const api = (async (url: string) => {
  requests.push(url);
  return { results: [{ _id: "a", name: "row" }], total: 1 };
}) as unknown as Api;

const mounted: App[] = [];
const cleanups: Array<() => void> = [];
let listed: { value: unknown } | undefined;
let counted: { value: unknown } | undefined;

const SourceTable = defineComponent({
  setup() {
    const rows = useTableRows({
      api,
      location: FETCH_URL,
      source: { fetchUrl: FETCH_URL, capabilities: {}, periodScope: SCOPE },
      columns: COLUMNS,
    });
    void useTableListData({
      componentId: "report",
      pageId: "reports",
      rows,
      query: computed(() => ({ offset: 0, limit: 10 })),
      archiveQuery: computed(() => ({})),
      isSelfManaged: computed(() => false),
    }).then(({ data }) => {
      listed = data;
    });
    void useTableCountsData({
      componentId: "report",
      pageId: "reports",
      rows,
      queries: computed(() => [{ id: "all", query: {} }]),
      archiveQuery: computed(() => ({})),
    }).then(({ data }) => {
      counted = data;
    });
    return () => h("div");
  },
});

function mountTable(): void {
  const app = createApp(SourceTable);
  engine.provideDmsFrontendRuntime(app, engine.createDmsFrontendRuntime());
  app.mount(document.createElement("div"));
  mounted.push(app);
}

function registerSelector() {
  const scope = effectScope();
  const period = scope.run(() => usePeriod({ defaultPreset: "last-7-days" }))!;
  cleanups.push(registerPeriodScope(SCOPE, period.state), () => scope.stop());
  return period;
}

const settle = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const periodOf = (url: string) =>
  Object.fromEntries(new URL(url, "http://dms.local").searchParams);

beforeEach(() => {
  requests.length = 0;
  listed = undefined;
  counted = undefined;
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe("a source table bound to a period scope", () => {
  it("requests nothing and keeps its skeleton until the scope registers", async () => {
    mountTable();
    await settle();
    expect(requests).toEqual([]);
    expect(listed).toBeDefined();
    expect(listed!.value).toBeNull();
  });

  // The server never registers a scope: an empty object there drew the tabs
  // with no skeleton, where the browser (its key carrying the period) drew
  // one, and hydration mismatched.
  it("keeps its tab counters' skeleton too until the scope registers", async () => {
    mountTable();
    await settle();
    expect(counted).toBeDefined();
    expect(counted!.value).toBeNull();
  });

  it("counts its tabs with the period once the scope registers", async () => {
    registerSelector();
    mountTable();
    await settle();
    expect(counted!.value).toEqual({ all: 1 });
  });

  it("sends the period with its request once the scope registers", async () => {
    const period = registerSelector();
    mountTable();
    await settle();
    expect(requests).toHaveLength(2);
    expect(listed!.value).toMatchObject({ total: 1 });
    const range = period.state.value.range!;
    expect(periodOf(requests[0]!)).toEqual({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      preset: "last-7-days",
      comparison: "none",
    });
  });

  it("lists again when the period changes", async () => {
    const period = registerSelector();
    mountTable();
    await settle();
    period.setPreset("last-30-days");
    period.setComparison("previous-period");
    await settle();
    const last = periodOf(requests.at(-1)!);
    expect(last.preset).toBe("last-30-days");
    expect(last.comparison).toBe("previous-period");
    expect(last.compareFrom).toBeDefined();
  });
});
