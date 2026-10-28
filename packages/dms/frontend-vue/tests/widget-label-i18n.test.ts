import { createSSRApp, defineComponent, h, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartRuntime } from "./helpers/charts-runtime";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";
import TopListRow from "../layers/dms-ui/app/components/top-list/internal/TopListRow.vue";
import { CHART_EVENT_NAMES } from "../layers/dms-ui/app/composables/chart/events";
import type { ChartClickPayload } from "../layers/dms-ui/app/composables/chart/events";
import type { ChartSeries } from "../layers/dms-ui/app/composables/chart/types";

const MESSAGES = new Map<string, string>(
  Object.entries({
    "my_module.sends": "Sends",
    "my_module.sends_before": "Sends, previous period",
    "my_module.domain": "Top domain",
    "my_module.domain_sends": "Sends to this domain",
  }),
);

const LITERAL_TITLE = "example.test";
const CHART_ID = "plot";

const response = {
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
};

const componentEvents: unknown[] = [];

function stubNuxt() {
  const translate = (key: string) => MESSAGES.get(key) ?? key;
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: translate }));
  const window = new EventTarget();
  window.addEventListener(CHART_EVENT_NAMES.pointClick, (event) => {
    if (event instanceof CustomEvent) componentEvents.push(event.detail);
  });
  vi.stubGlobal("window", window);
}

interface ApexClickOptions {
  dataPointIndex: number;
  seriesIndex: number;
}

/** Renders each series name and fires Apex's click hook so the payload is observable. */
const SeriesProbe = defineComponent({
  props: {
    options: { type: Object, required: true },
    // SAFETY: Chart passes its resolved ChartSeries array to this Apex host replacement.
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

async function mountWidgets(widget: () => ReturnType<typeof h>) {
  stubNuxt();
  const app = createSSRApp({ render: widget });
  for (const name of SLOT_COMPONENTS) app.component(name, Slot);
  app.component("DmsApexChartHost", SeriesProbe);
  app.component("DmsTopListRow", TopListRow);
  app.component("DmsLink", Link);
  await chartRuntime(app, response);
  await renderToString(app);
  return renderToString(app);
}

function renderTopList() {
  return mountWidgets(() =>
    h(TopListCard, {
      title: "$my_module.domain",
      componentId: "list",
      pageId: "i18n",
      showSparkline: true,
      fetchUrl: "/widgets",
    }),
  );
}

function renderChartCard(onPointClick: (payload: ChartClickPayload) => void) {
  return mountWidgets(() =>
    h(
      ChartCard,
      {
        title: "$my_module.sends",
        componentId: "card",
        pageId: "i18n",
        fetchUrl: "/widgets",
      },
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
  componentEvents.length = 0;
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
    expect(componentEvents).toContainEqual({
      component: CHART_ID,
      data: expect.objectContaining({ seriesName: "Sends" }),
    });
  });
});
