// @vitest-environment jsdom
/**
 * A page's block is brought into view by its anchor, the key path it is
 * declared under (`summary`, `tabs.statistics`): `scrollToBlock` scrolls its
 * first element and answers whether it found it. A block that is not on
 * screen — never drawn, or unmounted since — answers false.
 */
import {
  createApp,
  defineComponent,
  Fragment,
  h,
  nextTick,
  ref,
  type App,
  type ComponentPublicInstance,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBlockAnchor } from "../layers/dms-ui/app/build/composables/page/blockAnchors";
import { scrollToBlock } from "../layers/dms-ui/app/utils/scrollToBlock";

vi.mock("#dms-core/app/build/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    blockFor: () => undefined,
    isActive: ref(false),
    session: ref(null),
  }),
}));

let app: App | undefined;
let host: HTMLDivElement;
const scrolled: Array<{ element: Element; options: unknown }> = [];

const Section = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("section", { class: "section" }, slots.default?.()),
});

// A block rendering several roots: its anchor is its first element.
const Pair = defineComponent({
  setup: () => () =>
    h(Fragment, [h("h3", { class: "pair-head" }), h("p", "body")]),
});

// A list beside the item it selects, like a split layout: one child in a
// named slot, the other in the default one.
const Split = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", { class: "split" }, [
        h("aside", slots.aside?.()),
        h("article", slots.default?.()),
      ]),
});

const resolvedChild = (id: string, component: unknown, slot?: string) => ({
  id,
  component,
  options: {},
  children: [],
  ...(slot ? { slot } : {}),
});

async function mountPage(showSecond = ref(true)) {
  const { default: RecursiveComponent } = await import(
    "../layers/dms-ui/app/components/RecursiveComponent.vue"
  );
  const block = (id: string, component: unknown, children: unknown[] = []) =>
    h(RecursiveComponent, {
      component: { ...resolvedChild(id, component), children },
      pageId: "routes",
      componentId: id,
      layoutPath: id,
    });
  app = createApp({
    render: () =>
      h("main", [
        block("summary", Pair),
        showSecond.value
          ? block("tabs", Section, [resolvedChild("statistics", Section)])
          : null,
        block("explorer", Split, [
          resolvedChild("tree", Section, "aside"),
          resolvedChild("header", Pair),
        ]),
      ]),
  });
  app.component("DmsRecursiveComponent", RecursiveComponent);
  app.mount(host);
  await nextTick();
  return showSecond;
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("computed", (getter: () => unknown) => ({
    get value() {
      return getter();
    },
  }));
  vi.stubGlobal("provide", () => {});
  host = document.createElement("div");
  document.body.append(host);
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (options?: unknown) {
    scrolled.push({ element: this, options });
  };
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("scrollToBlock", () => {
  it("scrolls a top-level block and a nested one by their key path", async () => {
    await mountPage();
    expect(scrollToBlock("tabs.statistics")).toBe(true);
    expect(scrolled.at(-1)?.element).toBe(
      host.querySelectorAll("section.section")[1],
    );
    expect(scrolled.at(-1)?.options).toEqual({ block: "start" });
    expect(scrollToBlock("summary", { behavior: "smooth" })).toBe(true);
    expect(scrolled.at(-1)).toEqual({
      element: host.querySelector(".pair-head"),
      options: { behavior: "smooth" },
    });
  });

  it("finds the children of a block that places them in its slots", async () => {
    await mountPage();
    expect(scrollToBlock("explorer.header")).toBe(true);
    expect(scrolled.at(-1)?.element).toBe(
      host.querySelector(".split article .pair-head"),
    );
    expect(scrollToBlock("explorer.tree")).toBe(true);
    expect(scrolled.at(-1)?.element).toBe(
      host.querySelector(".split aside section"),
    );
  });

  it("answers false for a block that is not on screen", async () => {
    const showSecond = await mountPage();
    expect(scrollToBlock("missing")).toBe(false);
    showSecond.value = false;
    await nextTick();
    expect(scrollToBlock("tabs")).toBe(false);
    expect(scrollToBlock("tabs.statistics")).toBe(false);
    expect(scrolled).toEqual([]);
  });
});

describe("registerBlockAnchor", () => {
  it("leaves an anchor to the block that took it over", () => {
    const first = {} as ComponentPublicInstance;
    const second = {
      $: { subTree: { el: document.createElement("div") } },
    } as unknown as ComponentPublicInstance;
    registerBlockAnchor("chart", first);
    registerBlockAnchor("chart", second);
    registerBlockAnchor("chart", null, first);
    expect(scrollToBlock("chart")).toBe(true);
    registerBlockAnchor("chart", null, second);
    expect(scrollToBlock("chart")).toBe(false);
  });
});
