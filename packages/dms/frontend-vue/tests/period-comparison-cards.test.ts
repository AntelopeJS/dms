/**
 * A card bound to a period selector shows the comparison the selector
 * applies: its label follows the selected mode, its comparison value is
 * formatted as the value, and "no comparison" hides all of it.
 */
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  ref,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { registerPeriodScope } from "../layers/dms-core/app/composables/period/usePeriodScope";
import type {
  PeriodComparison,
  PeriodPreset,
  PeriodState,
} from "../layers/dms-core/app/composables/period/types";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

const response = ref<Record<string, unknown> | null>(null);

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: response,
    isLoading: ref(false),
    error: ref(null),
    refresh: async () => {},
  }),
}));

// The list imports its row rather than resolving it: the stub replaces the
// module, and prints whether the row was asked for its change.
vi.mock(
  "../layers/dms-ui/app/components/top-list/internal/TopListRow.vue",
  async () => {
    const { defineComponent: define, h: render } = await import("vue");
    return {
      default: define({
        props: { showDelta: Boolean },
        setup: (rowProps) => () =>
          render("span", { "data-row-delta": String(rowProps.showDelta) }),
      }),
    };
  },
);

const SCOPE = "sales";
const RANGE = {
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2026-10-31T23:59:59Z"),
};
const COMPARE_RANGE = {
  from: new Date("2025-10-01T00:00:00Z"),
  to: new Date("2025-10-31T23:59:59Z"),
};
const TRANSLATIONS: Record<string, string> = {
  "dms.chart.versus_value": "vs {value}",
  "dms.period.compare_labels.previous-period": "vs previous period",
  "dms.period.compare_labels.previous-year": "vs previous year",
  "dms.period.compare_options.previous-year": "Previous year",
  "dms.chart.legend_comparison": "Comparison",
};
// The trend badge's own classes.
const TREND_BADGE = "whitespace-nowrap tabular-nums transition-colors";
const KPI_TREND_LINE = "flex h-6 min-w-0 items-center gap-2";

function translate(key: string, params?: Record<string, string> | string) {
  const template = TRANSLATIONS[key] ?? key;
  if (typeof params !== "object") return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

function periodState(
  comparison: PeriodComparison,
  preset: PeriodPreset = "this-month",
): PeriodState {
  const range = preset === "all" ? null : RANGE;
  const isComparing = comparison !== "none" && range !== null;
  return {
    preset,
    comparison,
    range,
    compareRange: isComparing ? COMPARE_RANGE : null,
    key: `${preset}:${comparison}`,
  };
}

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function render(
  card: Component,
  props: Record<string, unknown>,
  state: PeriodState | null,
): Promise<string> {
  const app = createSSRApp({
    setup() {
      if (state)
        registerPeriodScope(
          SCOPE,
          computed(() => state),
        );
      return () =>
        h(card, {
          title: "Revenue",
          componentId: "card",
          pageId: "page",
          periodScope: SCOPE,
          ...props,
        });
    },
  });
  for (const name of ["DmsCard", "UIcon", "USkeleton", "UButton", "UBadge"]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

beforeEach(() => {
  useRealDataEngine();
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: translate }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
});

afterEach(() => vi.unstubAllGlobals());

describe("a KPI card bound to a period selector", () => {
  beforeEach(() => {
    response.value = { value: 48200, previousValue: 42900, delta: 12.4 };
  });

  it.each([
    ["previous-period", "vs previous period"],
    ["previous-year", "vs previous year"],
  ] as const)("names the %s comparison", async (comparison, label) => {
    const html = await render(KpiCard, {}, periodState(comparison));
    expect(html).toContain(label);
    expect(html).toContain(TREND_BADGE);
  });

  it("keeps an explicit compareLabel over the selected comparison", async () => {
    const html = await render(
      KpiCard,
      { compareLabel: "vs last campaign" },
      periodState("previous-year"),
    );
    expect(html).toContain("vs last campaign");
    expect(html).not.toContain("vs previous year");
  });

  it("shows the comparison value formatted as the value", async () => {
    const html = await render(
      KpiCard,
      { valueFormat: "currency", currencyCode: "EUR" },
      periodState("previous-period"),
    );
    expect(html).toContain("vs €42,900");
  });

  it("keeps a compact card without its comparison value", async () => {
    const html = await render(
      KpiCard,
      { showPreviousValue: false },
      periodState("previous-period"),
    );
    expect(html).not.toContain("vs 42");
    expect(html).toContain(TREND_BADGE);
  });

  it("hides the change, the value compared against and the label with no comparison", async () => {
    const html = await render(
      KpiCard,
      { compareLabel: "vs last campaign", description: "Net of refunds" },
      periodState("none"),
    );
    expect(html).not.toContain(TREND_BADGE);
    expect(html).not.toContain("vs ");
    expect(html).not.toContain(KPI_TREND_LINE);
    expect(html).toContain("Net of refunds");
  });

  it("draws no empty row with no comparison and nothing else to show", async () => {
    const html = await render(KpiCard, {}, periodState("none"));
    expect(html).not.toContain("mt-auto");
    expect(html).not.toContain("—");
  });

  it("hides the comparison when the period has no window to compare", async () => {
    const html = await render(
      KpiCard,
      {},
      periodState("previous-period", "all"),
    );
    expect(html).not.toContain(TREND_BADGE);
    expect(html).not.toContain("vs ");
  });

  it("hides it in the stat variant too", async () => {
    const html = await render(
      KpiCard,
      { variant: "stat" },
      periodState("none"),
    );
    expect(html).not.toContain(TREND_BADGE);
    expect(html).not.toContain("flex h-4 items-center");
  });

  it("shows the comparison value in the stat variant", async () => {
    const html = await render(
      KpiCard,
      { variant: "stat" },
      periodState("previous-year"),
    );
    expect(html).toContain("vs 42.9");
    expect(html).toContain(TREND_BADGE);
  });

  it("keeps the static label of a card with no selector registered", async () => {
    const html = await render(
      KpiCard,
      { compareLabel: "vs previous month" },
      null,
    );
    expect(html).toContain("vs previous month");
    expect(html).toContain(TREND_BADGE);
  });
});

describe("a chart card bound to a period selector", () => {
  beforeEach(() => {
    response.value = {
      value: 48200,
      previousValue: 42900,
      delta: 12.4,
      series: [{ name: "Revenue", data: [1, 2] }],
      comparisonSeries: [{ name: "Before", data: [1, 1] }],
    };
  });

  it("names the comparison series after the selected comparison", async () => {
    const html = await render(ChartCard, {}, periodState("previous-year"));
    expect(html).toContain("Previous year");
    expect(html).toContain("vs 42.9");
  });

  it("draws no change, no comparison value and no legend with no comparison", async () => {
    const html = await render(ChartCard, {}, periodState("none"));
    expect(html).not.toContain(TREND_BADGE);
    expect(html).not.toContain("vs ");
    expect(html).not.toContain("Comparison");
    expect(html).not.toContain("Previous year");
  });
});

describe("a top list bound to a period selector", () => {
  beforeEach(() => {
    response.value = { items: [{ id: "a", title: "A", value: 3, delta: 5 }] };
  });

  it("shows its rows' changes while comparing", async () => {
    const html = await render(TopListCard, {}, periodState("previous-period"));
    expect(html).toContain('data-row-delta="true"');
  });

  it("drops its rows' changes with no comparison", async () => {
    const html = await render(TopListCard, {}, periodState("none"));
    expect(html).toContain('data-row-delta="false"');
  });
});
