import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";

const response = ref<Record<string, unknown> | null>(null);
const loading = ref(false);
const fetchOptions = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: (options: Record<string, unknown>) => {
    fetchOptions.push(options);
    return {
      data: response,
      isLoading: loading,
      error: ref(null),
      refresh: async () => {},
    };
  },
}));

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const TREND_LINE = 'class="flex h-6 min-w-0 items-center gap-2"';
const STAT_TREND_PLACEHOLDER = 'class="flex h-4 items-center gap-1.5"';
const FOOTNOTE_PLACEHOLDER = 'class="block h-4"';
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
  vi.stubGlobal("useDmsState", (_key: string, initial: () => unknown) =>
    ref(initial()),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  loading.value = false;
});

describe("a KPI card with no comparison period", () => {
  it("shows no change at all, not a 0% stand-in", async () => {
    response.value = { value: 1535, sparkline: [1, 2, 3] };
    const html = await render();
    expect(html).not.toContain(TREND_BADGE);
    expect(html).not.toContain("●");
  });

  it("drops the comparison label, which names a period it does not compare", async () => {
    response.value = { value: 1535 };
    const html = await render();
    expect(html).not.toContain("vs previous month");
    // Its line is held, so toggling a comparison moves nothing.
    expect(html).toContain(FOOTNOTE_PLACEHOLDER);
  });

  it("shows the description in its place", async () => {
    response.value = { value: 1535 };
    const html = await render({ description: "Paid orders" });
    expect(html).not.toContain("vs previous month");
    expect(html).toContain("Paid orders");
  });

  it("keeps the comparison label while comparing", async () => {
    response.value = { value: 1535, previousValue: 1616, delta: -5 };
    const html = await render({ description: "Paid orders" });
    expect(html).toContain("vs previous month");
    expect(html).not.toContain(FOOTNOTE_PLACEHOLDER);
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

describe("a stat KPI card loading its first value", () => {
  // The sparkline's 24px box, beside the trend's line: the aside is taller
  // than the value column, so it sets the card's height.
  const SPARKLINE_BOX = 'class="h-6 w-16"';

  it("holds the sparkline's box, so the card keeps its height when it lands", async () => {
    loading.value = true;
    response.value = null;
    const loadingHtml = await render({ variant: "stat", showSparkline: true });
    loading.value = false;
    response.value = { value: 1535, delta: 4, sparkline: [1, 2, 3] };
    const loadedHtml = await render({ variant: "stat", showSparkline: true });
    expect(loadingHtml).toContain(SPARKLINE_BOX);
    expect(loadedHtml).toContain(SPARKLINE_BOX);
  });

  it("keeps the box when the value comes without a sparkline", async () => {
    response.value = { value: 1535 };
    const html = await render({ variant: "stat", showSparkline: true });
    expect(html).toContain(SPARKLINE_BOX);
  });
});

describe("a live KPI card", () => {
  it("reads on its realtimeTopic and follows its period scope at once", async () => {
    fetchOptions.length = 0;
    response.value = { value: 1535, previousValue: 1616, delta: -5 };
    await render({ periodScope: "api", realtimeTopic: "api:requests" });
    expect(fetchOptions.at(-1)).toMatchObject({
      periodScope: "api",
      realtimeTopic: "api:requests",
    });
  });
});
