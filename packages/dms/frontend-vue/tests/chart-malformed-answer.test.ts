/** @vitest-environment jsdom */
/**
 * A chart reads whatever its route answers. A route answering a shape the
 * chart does not read leaves that chart empty and the page around it whole.
 */
import { defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverRender } from "./helpers/api-data-runtime";
import { stubBlockRuntime } from "./helpers/block-runtime";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";

const authFetch = vi.fn();

const PlotProbe = defineComponent({
  props: {
    options: { type: Object, required: true },
    series: { type: Array, required: true },
  },
  setup: (props) => () =>
    h("output", { class: "series" }, JSON.stringify(props.series)),
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

function registerUi(app: App): void {
  for (const name of ["DmsCard", "DmsClientOnly", "UIcon", "USkeleton"])
    app.component(name, Slot);
  app.component("DmsApexChartHost", PlotProbe);
  app.config.globalProperties.$t = String;
}

const BareLine = defineComponent({
  setup: () => () =>
    h("main", [
      h("p", "Beside the chart"),
      h(Chart, {
        type: "line",
        title: "Revenue",
        fetchUrl: "/stats/revenue",
        componentId: "plot",
        pageId: "stats",
      }),
    ]),
});

const LineCard = defineComponent({
  setup: () => () =>
    h(
      ChartCard,
      {
        title: "Revenue",
        componentId: "card",
        pageId: "stats",
        fetchUrl: "/stats/revenue",
      },
      () => h(Chart, { type: "line", componentId: "plot", pageId: "stats" }),
    ),
});

beforeEach(async () => {
  await stubBlockRuntime(authFetch);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("a chart whose route answers a shape it does not read", () => {
  it("renders the page around a bare chart whose series carry no points", async () => {
    authFetch.mockResolvedValue({ series: [{ name: "Revenue", data: null }] });

    const { html } = await serverRender(BareLine, registerUi);

    expect(html).toContain("Beside the chart");
    expect(html).not.toContain('class="series"');
  });

  it("renders a chart card handed bare points in place of its series", async () => {
    authFetch.mockResolvedValue({ value: 180, series: [{ x: 1, y: 180 }] });

    const { html } = await serverRender(LineCard, registerUi);

    expect(html).toContain("Revenue");
    expect(html).not.toContain('class="series"');
  });
});
