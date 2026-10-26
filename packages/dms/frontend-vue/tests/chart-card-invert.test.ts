import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import { chartRuntime } from "./helpers/charts-runtime";

const response = ref<Record<string, unknown> | null>(null);

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const GOOD_TONE = "text-success";
const BAD_TONE = "text-error";

async function render(props: Record<string, unknown> = {}) {
  const app = createSSRApp({
    render: () =>
      h(ChartCard, {
        title: "Errors",
        componentId: "card",
        pageId: "p",
        fetchUrl: "/errors",
        ...props,
      }),
  });
  for (const name of ["DmsCard", "UIcon", "USkeleton"]) {
    app.component(name, Slot);
  }
  await chartRuntime(app, response.value);
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => vi.unstubAllGlobals());

describe("ChartCard invert", () => {
  it("shows a rising value in the success colour by default", async () => {
    response.value = { value: 120, delta: 12, series: [] };
    const html = await render();
    expect(html).toContain(GOOD_TONE);
    expect(html).not.toContain(BAD_TONE);
  });

  it("shows a rising value in the error colour when lower is better", async () => {
    response.value = { value: 120, delta: 12, series: [] };
    const html = await render({ invert: true });
    expect(html).toContain(BAD_TONE);
    expect(html).not.toContain(GOOD_TONE);

    expect(html).toContain("i-ph-trend-up");
  });

  it("shows a falling value in the success colour when lower is better", async () => {
    response.value = { value: 80, delta: -12, series: [] };
    expect(await render({ invert: true })).toContain(GOOD_TONE);
  });
});
