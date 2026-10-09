import { computed, createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ActivityFeed from "../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue";

const items = ref<Array<Record<string, unknown>>>([]);

vi.mock("../layers/dms-ui/app/build/composables/blocks/useBlockItems", () => ({
  useBlockItems: () => ({
    items: computed(() => items.value),
    isPending: computed(() => false),
    hasError: computed(() => false),
    refresh: async () => {},
  }),
}));

const Slot = defineComponent({
  props: { title: { type: String, default: undefined } },
  setup:
    (props, { slots, attrs }) =>
    () =>
      h("div", attrs, [props.title, slots.default?.()]),
});

async function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(ActivityFeed, {
        componentId: "activity",
        pageId: "settings",
        title: "Recent account activity",
        fetchUrl: "/settings/activity",
        ...props,
      }),
  });
  for (const name of [
    "DmsCard",
    "UIcon",
    "USkeleton",
    "UButton",
    "ULink",
    "NuxtLink",
  ]) {
    app.component(name, Slot);
  }
  return renderToString(app);
}

/** The opening tag of the feed's scroll area, if it has one. */
function scrollArea(html: string): string | undefined {
  return html.match(/<div[^>]*role="region"[^>]*>/)?.[0];
}

beforeEach(() => {
  items.value = Array.from({ length: 25 }, (_, index) => ({
    id: `e${index}`,
    title: `Entry ${index}`,
    date: new Date(Date.UTC(2026, 9, 9, 23 - index)).toISOString(),
  }));
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
});

afterEach(() => vi.unstubAllGlobals());

it("filling its cell, scrolls the entries in a focusable region sized to nothing", async () => {
  const area = scrollArea(await render({ fillHeight: true }));
  expect(area).toBeDefined();
  expect(area).toContain('tabindex="0"');
  expect(area).toContain('aria-label="Recent account activity"');
  // Sized to nothing, it leaves the row's height to the cards beside it…
  expect(area).toMatch(/\bcontain-size\b/);
  expect(area).toMatch(/\boverflow-y-auto\b/);
  expect(area).toMatch(/\bh-full\b/);
  // …and once the grid stacks its cells, takes its own height, capped.
  expect(area).toContain(
    "[@container_style(--dms-grid-tracks:1)]:max-h-[24rem]",
  );
  expect(area).toContain(
    "[@container_style(--dms-grid-tracks:1)]:contain-none",
  );
});

it("keeps each day's separator on top of the scrolled entries", async () => {
  const html = await render({ fillHeight: true });
  expect(html).toMatch(/<div[^>]*class="[^"]*\bsticky top-0\b[^"]*"[^>]*><h3/);
});

it("names the region after the feed when it has no title", async () => {
  const area = scrollArea(await render({ fillHeight: true, title: undefined }));
  expect(area).toContain('aria-label="dms.activity_feed.list_label"');
});

it("grows with its entries by default, without a scroll area", async () => {
  const html = await render({});
  expect(scrollArea(html)).toBeUndefined();
  expect(html).not.toContain("contain-size");
  expect(html).not.toContain("sticky");
});

it("shows only the latest `maxItems` entries", async () => {
  const html = await render({ fillHeight: true, maxItems: 20 });
  expect(html).toContain("Entry 0");
  expect(html).toContain("Entry 19");
  expect(html).not.toContain("Entry 20");
  expect(new Set(html.match(/Entry \d+/g)).size).toBe(20);
});
