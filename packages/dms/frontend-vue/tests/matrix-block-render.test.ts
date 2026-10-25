/**
 * The Matrix block drawn on the server from static rows: a grid with its
 * roles, the row header, typed cells, server cell states, groups on a
 * column with their counts and subtotals, the totals both ways with a missed
 * target, and the legend.
 */
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import MatrixBlock from "../layers/dms-ui/app/components/blocks/MatrixBlock.vue";
import type { MatrixData } from "../layers/dms-ui/app/types/matrix";

vi.mock(
  "../layers/dms-ui/app/build/composables/actions/useActionTargets",
  () => ({ useActionTargets: () => ({ handleCustomRowAction: vi.fn() }) }),
);
vi.mock(
  "../layers/dms-ui/app/composables/unsaved-changes/useUnsavedChanges",
  () => ({ useUnsavedChanges: vi.fn() }),
);
vi.mock("../layers/dms-ui/app/composables/confirm/useConfirm", () => ({
  useConfirm: () => ({ confirm: vi.fn() }),
}));
vi.mock(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers",
  () => ({ useRefreshTriggers: vi.fn() }),
);
vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: vi.fn() }),
);

const Slot = defineComponent({
  props: { label: { type: String, default: undefined } },
  setup:
    (props, { slots }) =>
    () =>
      h("span", [props.label, slots.default?.()]),
});

const STOCK: MatrixData = {
  columns: [
    { id: "36", label: "36", kind: "number" },
    { id: "37", label: "37", kind: "number" },
    {
      id: "status",
      label: "Status",
      kind: "select",
      options: [{ value: "ok", label: "OK", tone: "success" }],
    },
  ],
  rows: [
    {
      id: "ENT",
      label: "Entrepôt",
      description: "Grâce-Hollogne",
      values: { 36: 4, 37: 6, status: "ok", region: "Liège" },
      cells: { 36: { hint: "+2" } },
    },
    {
      id: "LG4",
      label: "Médiacité",
      values: { 36: 1, 37: 2, region: "Liège" },
      cells: {
        37: { disabled: true },
        36: { tone: "error", issues: ["Under minimum"] },
      },
      tone: "primary",
    },
    {
      id: "NE1",
      label: "Namur",
      values: { 36: 3, 37: 0, region: "Namur" },
    },
  ],
};

async function render(options: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(MatrixBlock, {
        componentId: "stock",
        pageId: "matrix-stock",
        staticData: STOCK,
        ...options,
      }),
  });
  for (const name of [
    "UButton",
    "UIcon",
    "UTooltip",
    "USkeleton",
    "UInput",
    "UKbd",
    "USelect",
    "USelectMenu",
    "UPopover",
    "UCheckbox",
    "DmsStatusPill",
    "DmsMeter",
    "DmsSectionHeader",
    "DmsSegmented",
    "DmsSaveBar",
  ]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

beforeEach(() => {
  useRealDataEngine();
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-GB"),
    t: (key: string) => key,
    n: String,
  }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn(), remove: vi.fn() }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {}, params: {} }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useDrawer", () => ({ open: vi.fn() }));
  vi.stubGlobal("useApiError", vi.fn());
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
});

afterEach(() => vi.unstubAllGlobals());

it("draws a grid with its row headers, typed cells and server cell states", async () => {
  const html = await render({
    title: "Stock",
    rowHeader: { label: "Store", numbers: true },
  });
  expect(html).toContain('role="grid"');
  expect(html).toContain('role="rowheader"');
  expect(html).toContain('role="gridcell"');
  expect(html).toContain('aria-label="Entrepôt · 36"');
  expect(html).toContain("Grâce-Hollogne");
  expect(html).toContain("+2");
  expect(html).toContain("OK");
  expect(html).toContain('aria-disabled="true"');
  expect(html).toContain("Under minimum");
  expect(html).toContain("Store");
});

it("groups the rows on a column, with counts and subtotals", async () => {
  const html = await render({
    grouping: {
      groupByField: "region",
      collapsible: true,
      count: true,
      subtotals: true,
    },
    totals: { rows: true, columns: true, label: "Total réparti" },
  });
  expect(html).toContain("Liège");
  expect(html).toContain("Namur");
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("dms.matrix.group_collapse");
  // Liège: 4 + 6 + 1 + 2 = 13; the whole grid: 16.
  expect(html).toContain(">13<");
  expect(html).toContain("Total réparti");
  expect(html).toContain(">16<");
});

it("turns a total red and says so when it misses its target", async () => {
  const html = await render({
    totals: { rows: true, columns: true },
    targets: { columns: { 36: 10 }, message: "Split all 10 pairs." },
    legend: [{ label: "Out of range", hatched: true }],
  });
  expect(html).toContain("Split all 10 pairs.");
  expect(html).toContain("/ 10");
  expect(html).toContain("text-error");
  expect(html).toContain("Out of range");
});

it("says there is nothing to show", async () => {
  const html = await render({
    staticData: { rows: [] },
    emptyLabel: "No stock",
  });
  expect(html).toContain("No stock");
  expect(html).not.toContain('role="grid"');
});

it("reads absent flags as their defaults: editable with a saveUrl", async () => {
  const html = await render({ saveUrl: "/save" });
  const cell = /<td[^>]*aria-label="Entrepôt · 36"[^>]*>/.exec(html)?.[0];
  expect(cell).toBeDefined();
  expect(cell).not.toContain("aria-readonly");
  const readOnly = await render({});
  expect(
    /<td[^>]*aria-label="Entrepôt · 36"[^>]*>/.exec(readOnly)?.[0],
  ).toContain('aria-readonly="true"');
  expect(html).toContain("dms.matrix.shortcuts.edit");
});

it("reads its route with the page, filters and sort the URL keeps under its id", async () => {
  const requests: Array<{ url: string; query?: Record<string, string> }> = [];
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: async (
      url: string,
      options?: { query?: Record<string, string> },
    ) => {
      requests.push({ url, query: options?.query });
      return { rows: STOCK.rows, columns: STOCK.columns, total: 60 };
    },
  }));
  vi.stubGlobal("useDmsRoute", () => ({
    params: {},
    query: {
      "stock.page": "2",
      "stock.search": "alma",
      "stock.facet_store": "ENT,WEB",
      "stock.sort": "36",
      "stock.dir": "desc",
      "other.page": "5",
    },
  }));
  const html = await render({
    staticData: undefined,
    fetchUrl: "/api/stock",
    pagination: "pages",
    pageSize: 25,
    facets: [{ id: "store", label: "Store", multiple: true }],
  });
  expect(requests[0]).toEqual({
    url: "/api/stock",
    query: {
      search: "alma",
      facet_store: "ENT,WEB",
      sort: "36",
      direction: "desc",
      offset: "25",
      limit: "25",
    },
  });
  expect(html).toContain("Entrepôt");
  expect(html).toContain("dms.matrix.range");
});
