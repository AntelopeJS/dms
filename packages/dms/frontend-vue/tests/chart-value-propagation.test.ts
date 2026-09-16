import { createSSRApp, defineComponent, h, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";
import type { ValuePrecision } from "../layers/dms-ui/app/composables/chart/types";

const AMOUNT = 9.391;
vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: ref({
      value: AMOUNT,
      previousValue: AMOUNT,
      series: [{ name: "Spend", data: [AMOUNT] }],
      items: [{ id: "spend", title: "Spend", value: AMOUNT }],
    }),
    isLoading: ref(false),
  }),
}));

interface ValueFormatter {
  formatter: (value: number) => string;
}
interface FormattedAxis {
  labels: ValueFormatter;
}
interface FormattedTooltip {
  y: ValueFormatter;
}
interface ChartOptions {
  yaxis: FormattedAxis;
  tooltip: FormattedTooltip;
}

const PlotProbe = defineComponent({
  props: {
    options: { type: Object as PropType<ChartOptions>, required: true },
  },
  setup: (props) => () =>
    h("output", [
      h(
        "span",
        { class: "axis" },
        props.options.yaxis.labels.formatter(AMOUNT),
      ),
      h(
        "span",
        { class: "tooltip" },
        props.options.tooltip.y.formatter(AMOUNT),
      ),
    ]),
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});
const Row = defineComponent({
  props: ["formattedValue"],
  setup: (props) => () => h("span", props.formattedValue),
});

function stubNuxt(locale: string) {
  vi.stubGlobal("useI18n", () => ({
    locale: ref(locale),
    t: (key: string) => key,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
}

const SLOT_COMPONENTS = [
  "DmsCard",
  "DmsClientOnly",
  "UIcon",
  "USkeleton",
  "DmsTrendBadge",
  "DmsSparkline",
  "UBadge",
];

type CardProps = InstanceType<typeof ChartCard>["$props"];

async function renderCards(
  currencyCode: string,
  locale: string,
  valuePrecision?: ValuePrecision,
) {
  stubNuxt(locale);
  const props: CardProps = {
    title: "Spend",
    componentId: "card",
    pageId: "precision",
    valueFormat: "currency",
    currencyCode,
    valuePrecision,
  };
  const app = createSSRApp({
    render: () =>
      h("main", [
        h(ChartCard, props, () =>
          h(Chart, { type: "line", componentId: "plot", pageId: "precision" }),
        ),
        h(KpiCard, props),
        h(TopListCard, props),
      ]),
  });
  for (const name of SLOT_COMPONENTS) app.component(name, Slot);
  app.component("DmsApexChartHost", PlotProbe);
  app.component("DmsTopListRow", Row);
  return renderToString(app);
}

afterEach(() => vi.unstubAllGlobals());

describe("card → nested chart → Apex format propagation", () => {
  it.each(["EUR", "JPY", "KWD"])(
    "propagates native %s formatting to headline, comparison, axis, tooltip and list",
    async (currency) => {
      const expected = new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency,
      }).format(AMOUNT);
      const html = await renderCards(currency, "fr-FR", "native");
      expect(html.split(expected)).toHaveLength(6);
      expect(html).toContain(`class="axis">${expected}`);
      expect(html).toContain(`class="tooltip">${expected}`);
      const numeric = new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency,
      })
        .formatToParts(AMOUNT)
        .filter((part) => part.type !== "currency")
        .map((part) => part.value)
        .join("")
        .trim();
      expect(html).toContain(`<span>${numeric}</span>`);
    },
  );

  it("preserves defaults and honours explicit zero and three digits", async () => {
    expect(await renderCards("EUR", "en-US")).toContain('class="axis">€9');
    expect(await renderCards("EUR", "en-US", 0)).toContain(
      'class="tooltip">€9',
    );
    expect(await renderCards("EUR", "en-US", 3)).toContain(
      'class="tooltip">€9.391',
    );
  });
});
