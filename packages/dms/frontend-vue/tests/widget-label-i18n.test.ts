import { createSSRApp, defineComponent, h, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";
import TopListRow from "../layers/dms-ui/app/components/top-list/internal/TopListRow.vue";
import { resolveI18nKey } from "../layers/dms-core/app/composables/translation/useTranslation";
import { CHART_EVENT_NAMES } from "../layers/dms-ui/app/composables/chart/events";
import type { ChartClickPayload } from "../layers/dms-ui/app/composables/chart/events";
import type { ChartSeries } from "../layers/dms-ui/app/composables/chart/types";

const MESSAGES: Record<string, string> = {
  "my_module.sends": "Sends",
  "my_module.sends_before": "Sends, previous period",
  "my_module.domain": "Top domain",
  "my_module.domain_sends": "Sends to this domain",
};

const LITERAL_TITLE = "example.test";
const CHART_ID = "plot";

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: ref({
      value: 1,
      series: [{ name: "$my_module.sends", data: [1] }],
      comparisonSeries: [{ name: "$my_module.sends_before", data: [1] }],
      items: [
        {
          id: "ranked",
          title: "$my_module.domain",
          description: "$my_module.domain_sends",
          sparkline: [1, 2],
          value: 1,
          to: "/domains/ranked",
        },
        { id: "literal", title: "example.test", value: 0 },
      ],
    }),
    isLoading: ref(false),
  }),
}));

const sendComponentEvent = vi.fn();

function stubNuxt() {
  const translate = (key: string) => MESSAGES[key] ?? key;
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: translate }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => resolveI18nKey(translate, key),
  }));
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent }));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
}

interface ApexClickOptions {
  dataPointIndex: number;
  seriesIndex: number;
}
interface ApexProbeOptions {
  chart: {
    events?: { dataPointSelection?: (...args: unknown[]) => void };
  };
}

/** Renders each series name and fires Apex's click hook so the payload is observable. */
const SeriesProbe = defineComponent({
  props: {
    options: { type: Object as PropType<ApexProbeOptions>, required: true },
    series: { type: Array as PropType<ChartSeries[]>, required: true },
  },
  setup: (props) => () => {
    const click: ApexClickOptions = { dataPointIndex: 0, seriesIndex: 0 };
    props.options.chart.events?.dataPointSelection?.(null, null, click);
    return h(
      "output",
      props.series.map((entry) => h("span", { class: "series" }, entry.name)),
    );
  },
});

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});
const Link = defineComponent({
  props: ["to"],
  setup: () => () => h("a"),
});

const SLOT_COMPONENTS = [
  "DmsCard",
  "DmsClientOnly",
  "UAvatar",
  "UBadge",
  "UIcon",
  "USkeleton",
  "DmsSparkline",
  "DmsTrendBadge",
];

function mountWidgets(widget: () => ReturnType<typeof h>) {
  stubNuxt();
  const app = createSSRApp({ render: widget });
  for (const name of SLOT_COMPONENTS) app.component(name, Slot);
  app.component("DmsApexChartHost", SeriesProbe);
  app.component("DmsTopListRow", TopListRow);
  app.component("DmsLink", Link);
  return renderToString(app);
}

function renderTopList() {
  return mountWidgets(() =>
    h(TopListCard, {
      title: "$my_module.domain",
      componentId: "list",
      pageId: "i18n",
      showSparkline: true,
    }),
  );
}

function renderChartCard(onPointClick: (payload: ChartClickPayload) => void) {
  return mountWidgets(() =>
    h(
      ChartCard,
      { title: "$my_module.sends", componentId: "card", pageId: "i18n" },
      () =>
        h(Chart, {
          type: "line",
          componentId: CHART_ID,
          pageId: "i18n",
          onPointClick,
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  sendComponentEvent.mockClear();
});

describe("module-supplied widget strings and the $ convention", () => {
  it("resolves top list row titles, descriptions and aria-labels", async () => {
    const html = await renderTopList();

    expect(html).toContain("Top domain");
    expect(html).toContain("Sends to this domain");
    expect(html).toContain(LITERAL_TITLE);
    expect(html).not.toContain("$my_module.");
    expect(html.split('aria-label="Top domain"')).toHaveLength(3);
  });

  it("resolves chart series names before Apex renders legend and tooltip", async () => {
    const html = await renderChartCard(() => {});

    expect(html).toContain('class="series">Sends</span>');
    expect(html).toContain('class="series">Sends, previous period</span>');
    expect(html).not.toContain("$my_module.");
  });

  it("carries the resolved series name in the click payload", async () => {
    let clicked: ChartClickPayload | null = null;
    await renderChartCard((payload) => {
      clicked = payload;
    });

    expect(clicked).toMatchObject({ seriesName: "Sends" });
    expect(sendComponentEvent).toHaveBeenCalledWith(
      CHART_EVENT_NAMES.pointClick,
      CHART_ID,
      expect.objectContaining({ seriesName: "Sends" }),
    );
  });
});
