/**
 * A TopListCard whose fetch failed says so, with a retry: a list that never
 * loaded is not an empty one. A failed refetch keeps the rows on screen.
 */
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

const data = ref<Record<string, unknown> | null>(null);
const error = ref<unknown>(null);

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data,
    isLoading: ref(false),
    error,
    refresh: async () => {},
  }),
}));

const Slot = defineComponent({
  props: { label: { type: String, default: undefined } },
  setup:
    (props, { slots }) =>
    () =>
      h("div", [props.label, slots.default?.()]),
});

async function render(): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(TopListCard, {
        title: "Slowest routes",
        componentId: "slowest",
        pageId: "overview",
        fetchUrl: "/slowest",
        emptyLabel: "Nothing slow",
      }),
  });
  for (const name of [
    "DmsCard",
    "DmsLink",
    "UBadge",
    "UIcon",
    "USkeleton",
    "UButton",
  ]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  data.value = null;
  error.value = null;
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
});

afterEach(() => vi.unstubAllGlobals());

it("shows a failed load as an error with a retry, not as an empty list", async () => {
  error.value = new Error("network");
  const html = await render();
  expect(html).toContain("dms.table.load_error_title");
  expect(html).toContain("dms.table.load_error_retry");
  expect(html).not.toContain("Nothing slow");
});

it("keeps the empty state for a list that loaded without rows", async () => {
  data.value = { items: [] };
  const html = await render();
  expect(html).toContain("Nothing slow");
  expect(html).not.toContain("dms.table.load_error_title");
});

it("keeps the last rows when only a refetch fails", async () => {
  data.value = { items: [{ id: "a", title: "GET /orders", value: 1864 }] };
  error.value = new Error("network");
  const html = await render();
  expect(html).toContain("GET /orders");
  expect(html).not.toContain("dms.table.load_error_title");
});
