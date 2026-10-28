/**
 * A TopListCard tied to a period selector names the selector's preset in its
 * head. The preset is the same name on both sides: the server prints it, and
 * the browser hydrates it, rather than a skeleton until the card mounts.
 */
import { computed, createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chartRuntime } from "./helpers/charts-runtime";
import { registerPeriodScope } from "../layers/dms-core/app/composables/period/usePeriodScope";
import type { PeriodState } from "../layers/dms-core/app/composables/period/types";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

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
          staticItems: [{ id: "pro", title: "Pro", value: 12 }],
        });
    },
  });
  app.component("DmsCard", Tagged("card"));
  app.component("UBadge", Tagged("badge"));
  app.component("USkeleton", Tagged("skeleton"));
  app.component("UIcon", Tagged("icon"));
  app.component("DmsTopListRow", Tagged("row"));
  await chartRuntime(app);
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => vi.unstubAllGlobals());

describe("TopListCard period badge", () => {
  it("prints the preset of a selector set up before it", async () => {
    const html = await render(() => {
      const state = { preset: "last_30_days" };
      registerPeriodScope(
        "dashboard-period",
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This fixture deliberately supplies a legacy preset outside PeriodPreset and omits unused state fields.
        computed(() => state as PeriodState),
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
