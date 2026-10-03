import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";

const response = ref<Record<string, unknown> | null>(null);

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: response,
    isLoading: ref(false),
    error: ref(null),
    refresh: async () => {},
  }),
}));

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const TREND_LINE = 'class="flex h-6 items-center"';
const STAT_TREND_PLACEHOLDER = 'class="h-4"';
// The trend badge's own classes (the sparkline's gradient carries "%" too).
const TREND_BADGE = "whitespace-nowrap tabular-nums transition-colors";

async function render(props: Record<string, unknown> = {}) {
  const app = createSSRApp({
    render: () =>
      h(KpiCard, {
        title: "Revenue",
        componentId: "kpi",
        pageId: "page",
        compareLabel: "vs previous month",
        ...props,
      }),
  });
  for (const name of ["DmsCard", "UIcon", "USkeleton", "UButton"]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
});

afterEach(() => vi.unstubAllGlobals());

describe("a KPI card with no comparison period", () => {
  it("shows no change at all, not a 0% stand-in", async () => {
    response.value = { value: 1535, sparkline: [1, 2, 3] };
    const html = await render();
    expect(html).not.toContain(TREND_BADGE);
    expect(html).not.toContain("●");
    expect(html).toContain("vs previous month");
  });

  it("keeps the trend's line, so toggling a comparison moves nothing", async () => {
    response.value = { value: 1535 };
    const without = await render();
    response.value = { value: 1535, previousValue: 1616, delta: -5 };
    const withDelta = await render();
    expect(without).toContain(TREND_LINE);
    expect(withDelta).toContain(TREND_LINE);
    expect(withDelta).toContain(TREND_BADGE);
    expect(withDelta).toMatch(/-5[.,]0\s?%/);
  });

  it("still shows a real flat change while comparing", async () => {
    response.value = { value: 1535, previousValue: 1535, delta: 0 };
    expect(await render()).toContain("●");
  });

  it("holds the trend's place in the stat variant too", async () => {
    response.value = { value: 1535, sparkline: [1, 2, 3] };
    const html = await render({ variant: "stat", showSparkline: true });
    expect(html).toContain(STAT_TREND_PLACEHOLDER);
    expect(html).not.toContain(TREND_BADGE);
  });

  it("reserves nothing when the card shows no change by design", async () => {
    response.value = { value: 1535 };
    const html = await render({ showDelta: false, compareLabel: undefined });
    expect(html).not.toContain(TREND_LINE);
  });
});
