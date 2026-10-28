import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import { ABSENT_VALUE_TEXT } from "../layers/dms-ui/app/composables/chart/formatValue";
import { chartRuntime } from "./helpers/charts-runtime";

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const SLOT_COMPONENTS = [
  "DmsCard",
  "DmsClientOnly",
  "UIcon",
  "USkeleton",
  "DmsTrendBadge",
  "DmsSparkline",
  "UBadge",
];

function stubNuxt() {
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-US"),
    t: (key: string) => key,
  }));
}

type CardProps = InstanceType<typeof ChartCard>["$props"];

async function renderCards() {
  stubNuxt();
  const props: CardProps = {
    title: "Revenue",
    componentId: "card",
    pageId: "absent",
    valueFormat: "currency",
    fetchUrl: "/revenue",
  };
  const app = createSSRApp({
    render: () => h("main", [h(ChartCard, props), h(KpiCard, props)]),
  });
  for (const name of SLOT_COMPONENTS) app.component(name, Slot);
  await chartRuntime(app, { series: [{ name: "Revenue", data: [] }] });
  return renderToString(app);
}

afterEach(() => vi.unstubAllGlobals());

describe("a card whose query measured nothing", () => {
  it("shows an absence where the figure goes, on both cards", async () => {
    const html = await renderCards();
    expect(html.split(ABSENT_VALUE_TEXT)).toHaveLength(3);
  });

  it("prints no zero, and no unit for a quantity there is none of", async () => {
    const html = await renderCards();
    expect(html, "a zero reads exactly like a measured figure").not.toContain(
      "<span>0</span>",
    );
    expect(html).not.toContain("€");
  });
});
