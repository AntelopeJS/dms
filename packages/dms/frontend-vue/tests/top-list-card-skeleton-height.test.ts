/**
 * A TopListCard's placeholder rows stand as tall as its loaded rows: 60px
 * when the rows carry a bar (`showBar`), 56px without, so the card does not
 * grow, and push what follows it, when its rows land.
 */
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({ data: ref(null), isLoading: ref(true) }),
}));

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function placeholderRows(props: Record<string, unknown>) {
  const app = createSSRApp({
    render: () =>
      h(TopListCard, {
        title: "Largest tables",
        componentId: "largest",
        pageId: "overview",
        skeletonCount: 3,
        ...props,
      }),
  });
  for (const name of ["DmsCard", "UBadge", "UIcon", "USkeleton", "UButton"]) {
    app.component(name, Slot);
  }
  const html = await renderToString(app);
  return [
    ...html.matchAll(/class="flex items-center gap-3 px-\[18px\] ([^"]*)"/g),
  ].map((match) => match[1]);
}

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
});

afterEach(() => vi.unstubAllGlobals());

it("draws 60px placeholder rows for rows with a bar", async () => {
  expect(await placeholderRows({ showBar: true })).toEqual([
    "h-[60px]",
    "h-[60px]",
    "h-[60px]",
  ]);
});

it("draws 56px placeholder rows for rows without one", async () => {
  expect(await placeholderRows({})).toEqual(["h-14", "h-14", "h-14"]);
});
