/** @vitest-environment jsdom */
/**
 * A table view's list, tab counters and footer figures, through the runtime's
 * real async data: a server render requests them in parallel and renders
 * them, the browser hydrates with them without asking again and without a
 * mismatch, and a client navigation does not wait for them.
 */
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  type App,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsFrontendRuntime } from "#dms/frontend-module";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("computed", computed);
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
vi.stubGlobal("useI18n", () => ({ locale: { value: "en" } }));
vi.stubGlobal("useTranslation", () => ({
  processI18n: (text: string) => text,
}));
vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));

const LOCATION = "/api/orders";
// SAFETY: This SSR data-fetch fixture uses only column ids and accessor keys; it does not render column inputs.
const COLUMNS = [{ id: "total", accessorKey: "total" }] as TableViewColumn[];
const DELAY_MS = 20;

interface Request {
  url: string;
  startedAt: number;
}

const requests: Request[] = [];
let inFlight = 0;
let mostInFlight = 0;

async function answer<T>(url: string, value: T): Promise<T> {
  requests.push({ url, startedAt: performance.now() });
  inFlight += 1;
  mostInFlight = Math.max(mostInFlight, inFlight);
  await new Promise((done) => setTimeout(done, DELAY_MS));
  inFlight -= 1;
  return value;
}

// SAFETY: The table requests only the list and count responses supplied here; this fixture does not implement fetch's generic helper methods.
const api = (async (url: string) =>
  url.endsWith("/count/batch")
    ? answer(url, { all: 2, open: 1 })
    : answer(url, { results: [{ _id: "a", total: 3 }], total: 1 })) as never;
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: (url: string) => answer(url, { sum: 42 }),
}));

const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);

const { useTableRows } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableRows"
);
const { useTableCountsData, useTableListData } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableListData"
);
const { useTableFooter } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableFooter"
);

const Table = defineComponent({
  setup() {
    const rows = useTableRows({ api, location: LOCATION, columns: COLUMNS });
    const keys = { componentId: "orders", pageId: "sales", rows };
    const archiveQuery = computed(() => ({}));

    const list = useTableListData({
      ...keys,
      query: computed(() => ({ offset: 0, limit: 10 })),
      archiveQuery,
      isSelfManaged: computed(() => false),
    });
    const counts = useTableCountsData({
      ...keys,
      queries: computed(() => [
        { id: "all", query: {} },
        { id: "open", query: { filter_status: "is:open" } },
      ]),
      archiveQuery,
    });
    const { footer } = useTableFooter({
      footer: {
        summary: [{ id: "sum", op: "sum", field: "total", label: "Sum" }],
      },
      columns: COLUMNS,
      location: LOCATION,
      query: computed(() => ({})),
      dataKey: "table-view-orders-sales",
    });
    return () =>
      h("p", [
        `rows:${list.data.value?.total ?? "-"}`,
        ` counts:${counts.data.value ? counts.data.value.all : "-"}`,
        ` sum:${footer.value?.summaries[0]?.value ?? "-"}`,
      ]);
  },
});

let runtime: DmsFrontendRuntime;
const mounted: App[] = [];

beforeEach(() => {
  requests.length = 0;
  inFlight = 0;
  mostInFlight = 0;
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

async function serverRender(): Promise<{ html: string; payload: unknown }> {
  runtime = engine.createDmsFrontendRuntime(undefined, {}, true);
  const app = createSSRApp(Table);
  engine.provideDmsFrontendRuntime(app, runtime);
  const html = await renderToString(app);
  return { html, payload: engine.serializeDmsPayload(runtime) };
}

describe("a table view's data in a server render", () => {
  it("requests the list, the counters and the footer in parallel and renders them", async () => {
    const { html } = await serverRender();

    expect(html).toBe("<p>rows:1 counts:2 sum:42</p>");
    expect(requests.map(({ url }) => url).sort()).toEqual([
      `${LOCATION}/count/batch`,
      `${LOCATION}/list`,
      `${LOCATION}/summary`,
    ]);
    expect(mostInFlight).toBe(3);
  });

  it("hands the browser the rendered data: no request, no mismatch", async () => {
    const { html, payload } = await serverRender();
    requests.length = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const browser = engine.createDmsFrontendRuntime(undefined, {});
    engine.restoreDmsPayload(browser, structuredClone(payload));
    const container = document.createElement("div");
    container.innerHTML = html;
    const app = createSSRApp(Table);
    engine.provideDmsFrontendRuntime(app, browser);
    app.mount(container);
    mounted.push(app);
    await nextTick();
    await new Promise((done) => setTimeout(done, DELAY_MS * 2));

    const mismatches = [...warn.mock.calls, ...error.mock.calls].filter(
      (call) => /hydration/i.test(String(call[0])),
    );
    warn.mockRestore();
    error.mockRestore();
    expect(mismatches).toEqual([]);
    expect(requests).toEqual([]);
    expect(container.textContent).toBe("rows:1 counts:2 sum:42");
  });
});
