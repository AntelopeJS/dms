/** @vitest-environment jsdom */
/**
 * A bare chart reads its data source's `series` shape, which the block
 * registry declares as one point per group: what a route the Builder
 * generates answers.
 */
import { defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverRender } from "./helpers/api-data-runtime";
import { stubBlockRuntime } from "./helpers/block-runtime";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";

const TITLE = "Invoices by month";

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
}

function chartPage(type: string, xaxisType?: string) {
  return defineComponent({
    setup: () => () =>
      h(Chart, {
        type,
        title: TITLE,
        xaxisType,
        fetchUrl: "/stats/invoices-by-month",
        componentId: "plot",
        pageId: "stats",
      }),
  });
}

async function plottedSeries(type: string, xaxisType?: string) {
  const { html } = await serverRender(chartPage(type, xaxisType), registerUi);
  const probe = document.createElement("div");
  probe.innerHTML = html;
  return JSON.parse(probe.querySelector(".series")?.textContent ?? "null");
}

beforeEach(async () => {
  await stubBlockRuntime(authFetch);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("a bare chart fed one point per group", () => {
  beforeEach(() => {
    authFetch.mockResolvedValue({
      series: [
        { x: 202112, y: 7 },
        { x: 202201, y: 6 },
        { x: "France", y: null },
      ],
    });
  });

  it.each(["column", "bar", "line"])(
    "draws the points as one series named after the %s chart, each group a category",
    async (type) => {
      expect(await plottedSeries(type)).toEqual([
        {
          name: TITLE,
          data: [
            { x: "202112", y: 7 },
            { x: "202201", y: 6 },
            { x: "France", y: null },
          ],
        },
      ]);
    },
  );

  it("keeps a numeric group numeric on a numeric axis", async () => {
    const [series] = await plottedSeries("line", "numeric");
    expect(series.data[0]).toEqual({ x: 202112, y: 7 });
  });
});
