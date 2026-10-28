/** @vitest-environment jsdom */
/**
 * A card bound to a period selector shows the comparison the selector
 * applies: its label follows the selected mode, its comparison value is
 * formatted as the value, and "no comparison" hides all of it.
 */
import { computed, createApp, h, ref, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extraRuntime,
  provideExtraRuntime,
  registerTextBoundaries,
} from "./helpers/chart-extra-runtime";
import { registerPeriodScope } from "../layers/dms-core/app/composables/period/usePeriodScope";
import type {
  PeriodComparison,
  PeriodPreset,
  PeriodState,
} from "../layers/dms-core/app/composables/period/types";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";
import type {
  ChartCardResponse,
  KpiCardResponse,
  TopListCardResponse,
} from "../layers/dms-ui/app/composables/chart/types";
import { isObject } from "../layers/dms-core/app/utils/type-check";

const response = ref<
  ChartCardResponse | KpiCardResponse | TopListCardResponse | null
>(null);
const mounted: Array<{ unmount(): void }> = [];
const scopes: Array<() => void> = [];

const SCOPE = "sales";
const RANGE = {
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2026-10-31T23:59:59Z"),
};
const COMPARE_RANGE = {
  from: new Date("2025-10-01T00:00:00Z"),
  to: new Date("2025-10-31T23:59:59Z"),
};
const TRANSLATIONS = new Map<string, string>(
  Object.entries({
    "dms.chart.versus_value": "vs {value}",
    "dms.period.compare_labels.previous-period": "vs previous period",
    "dms.period.compare_labels.previous-year": "vs previous year",
    "dms.period.compare_options.previous-year": "Previous year",
    "dms.chart.legend_comparison": "Comparison",
  }),
);
const TREND = /12[.,]4\s?%/;

function translate(key: string, params?: Record<string, string> | string) {
  const template = TRANSLATIONS.get(key) ?? key;
  if (!isObject(params)) return template;
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

async function render(
  card: Component,
  props: Partial<InstanceType<typeof KpiCard>["$props"]>,
  state: PeriodState | null,
): Promise<string> {
  const root = document.createElement("div");
  const app = createApp({
    setup() {
      if (state)
        scopes.push(
          registerPeriodScope(
            SCOPE,
            computed(() => state),
          ),
        );
      return () => {
        const cardProps: Partial<InstanceType<typeof KpiCard>["$props"]> = {
          title: "Revenue",
          componentId: "card",
          pageId: "page",
          periodScope: SCOPE,
          fetchUrl: state ? "/revenue" : undefined,
        };
        if (!state) {
          cardProps.staticValue = 48200;
          cardProps.staticDelta = 12.4;
          cardProps.staticPreviousValue = 42900;
        }
        return h(card, { ...cardProps, ...props });
      };
    },
  });
  provideExtraRuntime(app);
  registerTextBoundaries(app);
  app.mount(root);
  mounted.push(app);
  await vi.waitFor(() =>
    expect(root.querySelector('[aria-busy="true"]')).toBeNull(),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  return root.innerHTML;
}

beforeEach(async () => {
  await extraRuntime(async () => response.value);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: translate }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  scopes.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
});

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
    expect(html).toMatch(TREND);
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
    expect(html).toMatch(TREND);
  });

  it("hides the change, the value compared against and the label with no comparison", async () => {
    const html = await render(
      KpiCard,
      { compareLabel: "vs last campaign", description: "Net of refunds" },
      periodState("none"),
    );
    expect(html).not.toMatch(TREND);
    expect(html).not.toContain("vs ");
    expect(html).toContain("Net of refunds");
  });

  it("hides the comparison when the period has no window to compare", async () => {
    const html = await render(
      KpiCard,
      {},
      periodState("previous-period", "all"),
    );
    expect(html).not.toMatch(TREND);
    expect(html).not.toContain("vs ");
  });

  it("hides it in the stat variant too", async () => {
    const html = await render(
      KpiCard,
      { variant: "stat" },
      periodState("none"),
    );
    expect(html).not.toMatch(TREND);
    expect(html).not.toContain("vs ");
  });

  it("shows the comparison value in the stat variant", async () => {
    const html = await render(
      KpiCard,
      { variant: "stat" },
      periodState("previous-year"),
    );
    expect(html).toContain("vs 42.9");
    expect(html).toMatch(TREND);
  });

  it("omits the comparison label while the route answers no change yet", async () => {
    response.value = { value: 48200 };
    const html = await render(KpiCard, {}, periodState("previous-year"));
    expect(html).not.toContain("vs previous year");
    expect(html).not.toMatch(TREND);
  });

  it("keeps the static label of a card with no selector registered", async () => {
    const html = await render(
      KpiCard,
      { compareLabel: "vs previous month" },
      null,
    );
    expect(html).toContain("vs previous month");
    expect(html).toMatch(TREND);
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
    expect(html).not.toMatch(TREND);
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
    expect(html).toContain("A");
    expect(html).toMatch(/5[.,]0\s?%/);
  });

  it("drops its rows' changes with no comparison", async () => {
    const html = await render(TopListCard, {}, periodState("none"));
    expect(html).toContain("A");
    expect(html).not.toMatch(/5[.,]0\s?%/);
  });
});
