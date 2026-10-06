import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MeterBlock from "../layers/dms-ui/app/components/meter/MeterBlock.vue";

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

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
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
      h(MeterBlock, {
        componentId: "meter",
        pageId: "page",
        label: "Seats",
        fetchUrl: "/seats",
      }),
  });
  for (const name of ["DmsCard", "UIcon", "USkeleton", "UButton"]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

beforeEach(() => {
  data.value = null;
  error.value = null;
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
});

afterEach(() => vi.unstubAllGlobals());

it("shows a failed load as an error with a retry, not as 0 / 100", async () => {
  error.value = new Error("network");
  const html = await render();
  expect(html).toContain("dms.table.load_error_title");
  expect(html).toContain("dms.table.load_error_retry");
  expect(html).toContain("Seats");
  expect(html).not.toContain("100");
});

it("keeps the last figures when only a refetch fails", async () => {
  data.value = { value: 8, max: 10 };
  error.value = new Error("network");
  const html = await render();
  expect(html).not.toContain("dms.table.load_error_title");
  expect(html).toMatch(/8\s*\/\s*10/);
});
