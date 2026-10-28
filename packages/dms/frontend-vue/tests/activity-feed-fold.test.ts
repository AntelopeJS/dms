/** @vitest-environment jsdom */
/**
 * An ActivityFeed that must not hide what its entries say: `wrap` lets each
 * entry take the lines it needs instead of an ellipsis, and `visibleItems`
 * shows the first entries with a "Show N more" button that unfolds the rest.
 */
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ActivityFeed from "../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue";
import { chartRuntime } from "./helpers/charts-runtime";

const items = ref<Array<Record<string, unknown>>>([]);

const Stub = defineComponent({
  inheritAttrs: false,
  props: { title: { type: String, default: undefined }, label: String },
  setup:
    (props, { slots, attrs }) =>
    () =>
      h(
        attrs.onClick ? "button" : "div",
        { class: attrs.class, onClick: attrs.onClick },
        [props.label ?? props.title, slots.default?.()],
      ),
});

let app: ReturnType<typeof createApp> | undefined;

async function mountFeed(props: Record<string, unknown>): Promise<HTMLElement> {
  const host = document.createElement("div");
  app = createApp(() =>
    h(ActivityFeed, {
      componentId: "attention",
      pageId: "overview",
      groupByDay: false,
      items: items.value,
      ...props,
    }),
  );
  for (const name of ["DmsCard", "UIcon", "USkeleton", "UButton", "ULink"]) {
    app.component(name, Stub);
  }
  await chartRuntime(app);
  app.mount(host);
  return host;
}

const entryTitles = (host: HTMLElement) =>
  host.textContent?.match(/Route \d/g) ?? [];

beforeEach(() => {
  items.value = Array.from({ length: 5 }, (_, index) => ({
    id: `r${index}`,
    title: `Route ${index}`,
    detail: `500 "Upstream timed out while reading the response" × ${index + 1}`,
  }));
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-GB"),
    t: (key: string, params?: { count?: number }) =>
      params ? `${key}:${params.count}` : key,
  }));
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("shows every entry, without a fold, by default", async () => {
  const host = await mountFeed({});
  expect(entryTitles(host)).toHaveLength(5);
  expect(host.querySelector(".dms-activity-feed__fold")).toBeNull();
});

it("shows the first visibleItems and unfolds the rest, then folds them back", async () => {
  const host = await mountFeed({ visibleItems: 3 });
  expect(entryTitles(host)).toEqual(["Route 0", "Route 1", "Route 2"]);
  const button = host.querySelector<HTMLButtonElement>(
    ".dms-activity-feed__fold button",
  )!;
  expect(button.textContent).toBe("dms.activity_feed.show_more:2");

  button.click();
  await nextTick();
  expect(entryTitles(host)).toHaveLength(5);
  expect(button.textContent).toBe("dms.activity_feed.show_fewer");

  button.click();
  await nextTick();
  expect(entryTitles(host)).toHaveLength(3);
});

it("needs no fold when the entries fit in visibleItems", async () => {
  const host = await mountFeed({ visibleItems: 5 });
  expect(host.querySelector(".dms-activity-feed__fold")).toBeNull();
});

it("cuts each entry to one line by default, and wraps it whole with wrap", async () => {
  const cut = await mountFeed({ mono: true });
  expect(cut.querySelector(".truncate")).not.toBeNull();
  app?.unmount();

  const wrapped = await mountFeed({ mono: true, wrap: true });
  expect(wrapped.querySelector(".truncate")).toBeNull();
  expect(
    wrapped.querySelector(".\\[overflow-wrap\\:anywhere\\]"),
  ).not.toBeNull();
  expect(wrapped.textContent).toContain(
    '500 "Upstream timed out while reading the response" × 1',
  );
});
