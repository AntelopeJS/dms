// @vitest-environment jsdom
/**
 * An ActivityFeed that must not hide what its entries say: `wrap` lets each
 * entry take the lines it needs instead of an ellipsis, and `visibleItems`
 * shows the first entries with a "Show N more" button that unfolds the rest.
 */
import { computed, createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ActivityFeed from "../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue";

const items = ref<Array<Record<string, unknown>>>([]);

vi.mock("../layers/dms-ui/app/build/composables/blocks/useBlockItems", () => ({
  useBlockItems: () => ({
    items: computed(() => items.value),
    count: computed(() => undefined),
    isPending: computed(() => false),
    hasError: computed(() => false),
    refresh: async () => {},
  }),
}));

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

function mountFeed(props: Record<string, unknown>): HTMLElement {
  const host = document.createElement("div");
  app = createApp(() =>
    h(ActivityFeed, {
      componentId: "attention",
      pageId: "overview",
      groupByDay: false,
      ...props,
    }),
  );
  for (const name of ["DmsCard", "UIcon", "USkeleton", "UButton", "ULink"]) {
    app.component(name, Stub);
  }
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
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("shows every entry, without a fold, by default", () => {
  const host = mountFeed({});
  expect(entryTitles(host)).toHaveLength(5);
  expect(host.querySelector(".dms-activity-feed__fold")).toBeNull();
});

it("shows the first visibleItems and unfolds the rest, then folds them back", async () => {
  const host = mountFeed({ visibleItems: 3 });
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

it("needs no fold when the entries fit in visibleItems", () => {
  const host = mountFeed({ visibleItems: 5 });
  expect(host.querySelector(".dms-activity-feed__fold")).toBeNull();
});

it("cuts each entry to one line by default, and wraps it whole with wrap", () => {
  const cut = mountFeed({ mono: true });
  expect(cut.querySelector(".truncate")).not.toBeNull();
  app?.unmount();

  const wrapped = mountFeed({ mono: true, wrap: true });
  expect(wrapped.querySelector(".truncate")).toBeNull();
  expect(
    wrapped.querySelector(".\\[overflow-wrap\\:anywhere\\]"),
  ).not.toBeNull();
  expect(wrapped.textContent).toContain(
    '500 "Upstream timed out while reading the response" × 1',
  );
});
