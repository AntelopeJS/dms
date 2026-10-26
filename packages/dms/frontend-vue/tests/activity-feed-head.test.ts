/**
 * An ActivityFeed's head carries a count beside its title (the option, or the
 * `count` its route answers) and a soft badge before its actions; each entry
 * may add a third, dimmed mono line under its details.
 */
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActivityFeed from "../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue";
import { chartRuntime } from "./helpers/charts-runtime";

const items = ref<Array<Record<string, unknown>>>([]);
const fetchedCount = ref<number | undefined>(undefined);

const Card = defineComponent({
  props: {
    title: { type: String, default: undefined },
    count: { type: [Number, String], default: undefined },
  },
  setup:
    (props, { slots }) =>
    () =>
      h("div", { "data-card": "" }, [
        h("header", [
          props.title,
          props.count === undefined
            ? null
            : h("span", { "data-count": "" }, String(props.count)),
          slots.actions?.(),
        ]),
        slots.default?.(),
      ]),
});

const Badge = defineComponent({
  props: { label: String },
  setup: (props) => () => h("span", { "data-badge": "" }, props.label),
});

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(ActivityFeed, {
        componentId: "attention",
        pageId: "overview",
        title: "Needs attention",
        fetchUrl: "/api/attention",
        groupByDay: false,
        ...props,
      }),
  });
  app.component("DmsCard", Card);
  app.component("UBadge", Badge);
  for (const name of ["UIcon", "USkeleton", "UButton", "ULink", "NuxtLink"]) {
    app.component(name, Slot);
  }
  await chartRuntime(app, { items: items.value, count: fetchedCount.value });
  return renderToString(app);
}

beforeEach(() => {
  items.value = [
    {
      id: "cart",
      title: "POST /cart/checkout",
      meta: ["Client errors"],
      detail: '400 "Cart is empty" × 16',
    },
  ];
  fetchedCount.value = undefined;
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

afterEach(() => vi.unstubAllGlobals());

describe("ActivityFeed head", () => {
  it("draws no count and no badge unless asked", async () => {
    const html = await render({});
    expect(html).not.toContain("data-count");
    expect(html).not.toContain("data-badge");
  });

  it("shows the count option beside the title", async () => {
    const html = await render({ count: 7 });
    expect(html).toMatch(/<span data-count[^>]*>7<\/span>/);
  });

  it("prefers the count its route answers", async () => {
    fetchedCount.value = 4;
    const html = await render({ count: 7 });
    expect(html).toMatch(/<span data-count[^>]*>4<\/span>/);
  });

  it("draws a translated badge in the head", async () => {
    const html = await render({ badge: "$api.overview.last_24h" });
    expect(html).toMatch(
      /<span data-badge[^>]*>api\.overview\.last_24h<\/span>/,
    );
  });

  it("draws a literal badge as written", async () => {
    const html = await render({ badge: "Last 24 h" });
    expect(html).toMatch(/<span data-badge[^>]*>Last 24 h<\/span>/);
  });
});

describe("ActivityFeed entry detail", () => {
  it("writes the detail as a third, dimmed mono line", async () => {
    const html = await render({});
    const line = /<p class="([^"]*)"[^>]*>([^<]*)<\/p>/.exec(html);
    expect(line?.[2]?.trim()).toBe("400 &quot;Cart is empty&quot; × 16");
    expect(line?.[1]).toContain("font-mono");
    expect(line?.[1]).toContain("text-dimmed");
  });

  it("draws no detail line for an entry without one", async () => {
    items.value = [{ id: "a", title: "GET /health" }];
    const html = await render({});
    expect(html).not.toMatch(/<p class="[^"]*font-mono/);
  });
});
