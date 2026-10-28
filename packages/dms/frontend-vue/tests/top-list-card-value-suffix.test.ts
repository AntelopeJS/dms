/**
 * A TopListCard writes its unit after each formatted value (`valueSuffix`),
 * and a row's `valueLabel` replaces the formatted value outright.
 */
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chartRuntime } from "./helpers/charts-runtime";
import TopListCard from "../layers/dms-ui/app/components/top-list/TopListCard.vue";

type CardProps = InstanceType<typeof TopListCard>["$props"];
const rows = ref<NonNullable<CardProps["staticItems"]>>([]);

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function render(props: Partial<CardProps>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(TopListCard, {
        title: "Slowest routes",
        componentId: "slowest",
        pageId: "overview",
        showDelta: false,
        valuePrecision: 0,
        fetchUrl: "/routes",
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
  await chartRuntime(app, { items: rows.value });
  return renderToString(app);
}

/** The text of each row's value cell. */
function values(html: string): string[] {
  return [...html.matchAll(/<span class="text-toned[^"]*"[^>]*>([^<]*)</g)].map(
    (match) => (match[1] ?? "").trim(),
  );
}

beforeEach(() => {
  rows.value = [
    { id: "a", title: "GET /orders", value: 1864 },
    { id: "b", title: "GET /cart", value: 296 },
  ];
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-US"),
    t: (key: string) => `t($${key})`,
  }));
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
