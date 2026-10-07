import { createSSRApp, defineComponent, h, ref, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import StatGroup from "../layers/dms-ui/app/components/stat-group/StatGroup.vue";

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: ref({ value: 12 }),
    isLoading: ref(false),
    error: ref(null),
    refresh: async () => {},
  }),
}));

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

// The compact stat card both components draw through DmsStatCell.
const STAT_CARD = 'class="dms-card flex items-center gap-3.5 px-4 py-3.5';
const STAT_VALUE =
  "text-highlighted text-[22px] leading-[1.1] font-[650] tracking-[-0.035em] tabular-nums";

async function render(component: Component, props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(component, props) });
  for (const name of ["DmsCard", "UIcon", "USkeleton", "UButton"]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
});

afterEach(() => vi.unstubAllGlobals());

describe("the compact stat card", () => {
  it("is the same cell in a stat KPI card and a StatGroup of cards", async () => {
    const kpi = await render(KpiCard, {
      title: "Installed",
      icon: "i-ph-package",
      variant: "stat",
      componentId: "kpi",
      pageId: "page",
    });
    const group = await render(StatGroup, {
      layout: "cards",
      items: [{ icon: "i-ph-package", eyebrow: "Installed", value: "12" }],
    });
    for (const html of [kpi, group]) {
      expect(html).toContain(STAT_CARD);
      expect(html).toContain(STAT_VALUE);
      expect(html).toContain("Installed");
    }
  });
});
