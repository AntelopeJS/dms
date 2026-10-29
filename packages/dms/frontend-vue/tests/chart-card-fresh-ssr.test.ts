/** @vitest-environment jsdom */
/**
 * The first server render of a request, with nothing read before: a
 * ChartCard waits for its data and hands the series and the format it read
 * to the Chart nested in it, which draws them rather than its loading state.
 * The browser hydrating that HTML with its payload draws the same chart.
 * `chart-value-propagation.test.ts` covers the formats on a warm runtime.
 */
import { defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrate, serverRender } from "./helpers/api-data-runtime";
import { stubBlockRuntime } from "./helpers/block-runtime";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";

const AMOUNT = 9.391;
const AXIS = 'class="axis">€9<';
const SERIES_NAME = "Spend";

const authFetch = vi.fn(async () => ({
  value: AMOUNT,
  series: [{ name: SERIES_NAME, data: [AMOUNT] }],
}));

const PlotProbe = defineComponent({
  props: {
    options: { type: Object, required: true },
    series: { type: Array, required: true },
  },
  setup: (props) => () =>
    h("output", [
      h(
        "span",
        { class: "axis" },
        props.options.yaxis.labels.formatter(AMOUNT),
      ),
      h("span", { class: "series" }, JSON.stringify(props.series)),
    ]),
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});
const Page = defineComponent({
  setup: () => () =>
    h(
      ChartCard,
      {
        title: "Spend",
        componentId: "card",
        pageId: "fresh",
        valueFormat: "currency",
        fetchUrl: "/spend",
      },
      () => h(Chart, { type: "line", componentId: "plot", pageId: "fresh" }),
    ),
});

function registerUi(app: App): void {
  for (const name of ["DmsCard", "DmsClientOnly", "UIcon", "USkeleton"])
    app.component(name, Slot);
  app.component("DmsApexChartHost", PlotProbe);
}

async function settle(): Promise<void> {
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
}

const mounted: App[] = [];

beforeEach(async () => {
  await stubBlockRuntime(authFetch);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ChartCard in a fresh server render", () => {
  it("draws the fetched series in its nested Chart, not the loading state of a context copied before the data came", async () => {
    const { html } = await serverRender(Page, registerUi);

    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(html).toContain(AXIS);
    expect(html).toContain(`&quot;name&quot;:&quot;${SERIES_NAME}&quot;`);
  });

  it("hydrates the server's chart as it is, unlike a context the browser fills only at its first update after hydrating", async () => {
    const { html, payload } = await serverRender(Page, registerUi);
    const served = document.createElement("div");
    served.innerHTML = html;
    authFetch.mockClear();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { app, container } = hydrate(Page, html, payload, registerUi);
    mounted.push(app);
    await settle();

    expect(container.innerHTML).toBe(served.innerHTML);
    expect(container.innerHTML).toContain(AXIS);
    expect(warn).not.toHaveBeenCalled();
    expect(authFetch).not.toHaveBeenCalled();
  });
});
