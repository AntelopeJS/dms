/**
 * A TopListCard writes its unit after each formatted value (`valueSuffix`),
 * and a row's `valueLabel` replaces the formatted value outright.
 */
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

const rows = ref<Array<Record<string, unknown>>>([]);

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: ref({ items: rows.value }),
    isLoading: ref(false),
  }),
}));

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(TopListCard, {
        title: "Slowest routes",
        componentId: "slowest",
        pageId: "overview",
        showDelta: false,
        valuePrecision: 0,
        ...props,
      }),
  });
  for (const name of [
    "DmsCard",
    "DmsLink",
    "UBadge",
    "UIcon",
    "USkeleton",
    "UButton",
  ]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

/** The text of each row's value cell. */
function values(html: string): string[] {
  return [...html.matchAll(/<span class="text-toned[^"]*"[^>]*>([^<]*)</g)].map(
    (match) => (match[1] ?? "").trim(),
  );
}

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  rows.value = [
    { id: "a", title: "GET /orders", value: 1864 },
    { id: "b", title: "GET /cart", value: 296 },
  ];
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => (text.startsWith("$") ? `t(${text})` : text),
  }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
});

afterEach(() => vi.unstubAllGlobals());

describe("TopListCard value unit", () => {
  it("writes the bare formatted value by default", async () => {
    expect(values(await render({}))).toEqual(["1,864", "296"]);
  });

  it("writes the suffix right after each value", async () => {
    expect(values(await render({ valueSuffix: " ms" }))).toEqual([
      "1,864 ms",
      "296 ms",
    ]);
  });

  it("translates a `$` suffix", async () => {
    expect(values(await render({ valueSuffix: "$units.ms" }))).toEqual([
      "1,864t($units.ms)",
      "296t($units.ms)",
    ]);
  });

  it("writes a row's valueLabel as is, without the suffix", async () => {
    rows.value = [
      {
        id: "a",
        title: "GET /orders",
        value: 1864,
        valueLabel: "1.9 s (partial)",
      },
      { id: "b", title: "GET /cart", value: 296 },
    ];
    expect(values(await render({ valueSuffix: " ms" }))).toEqual([
      "1.9 s (partial)",
      "296 ms",
    ]);
  });
});
