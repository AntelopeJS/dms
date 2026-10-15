/**
 * A TopListCard tied to a period selector names the selector's preset in its
 * head. The preset is the same name on both sides: the server prints it, and
 * the browser hydrates it, rather than a skeleton until the card mounts.
 */
import { computed, createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { registerPeriodScope } from "../layers/dms-core/app/composables/period/usePeriodScope";
import type { PeriodState } from "../layers/dms-core/app/composables/period/types";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: ref({ items: [{ id: "pro", title: "Pro", value: 12 }] }),
    isLoading: ref(false),
  }),
}));

const Tagged = (tag: string) =>
  defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", { [`data-${tag}`]: "" }, slots.default?.()),
  });

async function render(beforeCard?: () => void): Promise<string> {
  const app = createSSRApp({
    setup() {
      beforeCard?.();
      return () =>
        h(TopListCard, {
          title: "Top plans",
          componentId: "plans",
          pageId: "dashboard",
          periodScope: "dashboard-period",
        });
    },
  });
  app.component("DmsCard", Tagged("card"));
  app.component("UBadge", Tagged("badge"));
  app.component("USkeleton", Tagged("skeleton"));
  app.component("UIcon", Tagged("icon"));
  app.component("DmsTopListRow", Tagged("row"));
  return renderToString(app);
}

beforeEach(() => {
  useRealDataEngine();
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
});

afterEach(() => vi.unstubAllGlobals());

describe("TopListCard period badge", () => {
  it("prints the preset of a selector set up before it", async () => {
    const html = await render(() => {
      registerPeriodScope(
        "dashboard-period",
        computed(() => ({ preset: "last_30_days" }) as PeriodState),
      );
    });
    expect(html).toContain("dms.period.presets.last_30_days");
    expect(html).not.toContain("data-skeleton");
  });

  it("holds the badge's place while no selector is known", async () => {
    const html = await render();
    expect(html).toContain("data-skeleton");
    expect(html).not.toContain("data-badge");
  });
});
