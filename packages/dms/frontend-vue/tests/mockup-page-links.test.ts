/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  createApp,
  defineComponent,
  h,
  nextTick,
  shallowRef,
} from "vue";
import type { JsonValue } from "../layers/dms-core/app/types/json";
import { useBlockPreviewEmbed } from "../layers/dms-ui/app/entries/composables/block-preview/useBlockPreviewEmbed";
import {
  parsePreviewOutboundMessage,
  PREVIEW_CHANNEL,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import { mockupNavigation } from "../layers/dms-ui/app/entries/utils/mockupFrame";
import {
  mockupLinkOf,
  mockupPageParams,
} from "../layers/dms-ui/app/entries/utils/mockupLinks";
import {
  pageForest,
  topMoveIndex,
} from "../layers/dms-ui/app/entries/utils/mockupPageTree";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type { BlockPreviewEmbed } from "../layers/dms-ui/app/entries/composables/block-preview/useBlockPreviewEmbed";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  rendered,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const ORIGIN = window.location.origin;

describe("mockup links", () => {
  it("reads the page and the row a viewer URL of this dashboard opens, and nothing from any other URL", () => {
    expect(
      mockupLinkOf("/mockup?name=demo&page=order&record=o2", ORIGIN),
    ).toEqual({ page: "order", record: "o2" });
    expect(mockupLinkOf("/mockup?name=demo&page=orders", ORIGIN)).toEqual({
      page: "orders",
    });
    expect(mockupLinkOf("/orders/o2", ORIGIN)).toBeUndefined();
    expect(mockupLinkOf("/mockup?name=demo", ORIGIN)).toBeUndefined();
    expect(
      mockupLinkOf("https://elsewhere.test/mockup?page=orders", ORIGIN),
    ).toBeUndefined();
  });

  it("fills a page's route parameter with the row a link named, else its sample row, and gives a page without a route none", () => {
    const route = { param: "id", sample: "o1" };
    expect(mockupPageParams({ route }, "o2")).toEqual({ id: "o2" });
    expect(mockupPageParams({ route }, undefined)).toEqual({ id: "o1" });
    expect(mockupPageParams({}, "o2")).toBeUndefined();
  });

  it("leaves a page with menu: false out of the sidebar and lights its nearest listed parent while it is open (fails when a detail page shows in the menu)", () => {
    const navigation = mockupNavigation({
      title: "Shop",
      categories: [],
      pages: [
        { id: "orders", title: "Orders" },
        { id: "order", title: "Order", menu: false, parent: "orders" },
        { id: "edit", title: "Edit", menu: false, parent: "order" },
      ],
      active: "edit",
    });

    expect(
      navigation.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(["orders"]);
    expect(navigation.active).toBe("orders");
  });
});

const parentWindow = { postMessage: vi.fn<(message: JsonValue) => void>() };
let app: App | undefined;
let embed: BlockPreviewEmbed;

function mountEmbed(): void {
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp(
    defineComponent({
      setup() {
        const root = shallowRef<HTMLElement | null>(null);
        embed = useBlockPreviewEmbed({
          root,
          initialState: undefined,
          setLocale: () => {},
        });
        return () => h("div", { ref: root });
      },
    }),
  );
  app.mount(host);
}

function fromParent(data: JsonValue): void {
  window.dispatchEvent(
    new MessageEvent("message", { data, source: window.parent }),
  );
}

const sentOf = (type: string) =>
  parentWindow.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => parsePreviewOutboundMessage(message)?.type === type);

function visit(path: string): Event {
  const event = new CustomEvent("inertia:before", {
    cancelable: true,
    detail: { visit: { url: new URL(path, ORIGIN) } },
  });
  document.dispatchEvent(event);
  return event;
}

function anchorTo(href: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = "Open";
  document.body.append(anchor);
  return anchor;
}

function click(target: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("links in the preview frame", () => {
  beforeEach(() => {
    parentWindow.postMessage.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    Object.defineProperty(window, "parent", {
      value: parentWindow,
      configurable: true,
    });
    mountEmbed();
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    document.body.replaceChildren();
    Object.defineProperty(window, "parent", {
      value: window,
      configurable: true,
    });
    vi.unstubAllGlobals();
  });

  it("hands the viewer a visit to a page of the mockup and cancels every visit off the preview's page (fails when a link loads the dashboard in the frame)", () => {
    const toMockupPage = visit("/mockup?name=demo&page=order&record=o2");
    const toDashboard = visit("/orders/o2");
    const sameQuery = visit(`${window.location.pathname}?orders.view=paid`);

    expect(toMockupPage.defaultPrevented).toBe(true);
    expect(toDashboard.defaultPrevented).toBe(true);
    expect(sameQuery.defaultPrevented).toBe(false);
    expect(sentOf("navigate")).toEqual([
      {
        channel: PREVIEW_CHANNEL,
        type: "navigate",
        id: "order",
        record: "o2",
      },
    ]);
  });

  it("follows a plain click on a link to a page of the mockup while nothing is inspected, and only a Ctrl or ⌘ click while inspecting, which then picks nothing (fails when a plain click leaves edit mode)", async () => {
    const anchor = anchorTo("/mockup?name=demo&page=orders");

    const plain = click(anchor);
    expect(plain.defaultPrevented).toBe(true);
    expect(sentOf("navigate")).toHaveLength(1);

    fromParent({ channel: PREVIEW_CHANNEL, type: "inspect", enabled: true });
    await nextTick();
    click(anchor);
    expect(sentOf("navigate")).toHaveLength(1);
    expect(sentOf("select-page")).toHaveLength(1);
    click(anchor, { ctrlKey: true });
    click(anchor, { metaKey: true });
    expect(sentOf("navigate")).toEqual([
      { channel: PREVIEW_CHANNEL, type: "navigate", id: "orders" },
      { channel: PREVIEW_CHANNEL, type: "navigate", id: "orders" },
      { channel: PREVIEW_CHANNEL, type: "navigate", id: "orders" },
    ]);
    expect(sentOf("select-page")).toHaveLength(1);
  });

  it("hands Escape to the viewer unless a menu or dialog of the page is open, which takes it", () => {
    const escape = () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    escape();
    const layer = document.createElement("div");
    layer.setAttribute("data-dismissable-layer", "");
    document.body.append(layer);
    escape();

    expect(sentOf("escape")).toHaveLength(1);
  });

  it("gives the blocks the route parameters of a render (fails when a detail page's {{params.id}} stays empty)", async () => {
    fromParent({
      channel: PREVIEW_CHANNEL,
      type: "render",
      tree: [],
      params: { id: "o2" },
    });
    await nextTick();

    expect(embed.params.value).toEqual({ id: "o2" });
  });
});

const LIST = mockupPage({
  id: "orders",
  title: "Orders",
  links: ["order"],
  tree: [{ type: "KpiCard", options: { title: "Orders" } }],
});
const EDIT = mockupPage({
  id: "order-edit",
  title: "Edit order",
  menu: false,
  parent: "order",
  route: { param: "id", sample: "o1" },
  paths: {},
});
const DETAIL = mockupPage({
  id: "order",
  title: "Order",
  menu: false,
  parent: "orders",
  route: { param: "id", sample: "o1" },
  tree: [{ type: "KpiCard", options: { title: "Order" } }],
  paths: {},
});

describe("following links in the viewer", () => {
  let viewer: MountedViewer | undefined;
  let runtime: ReturnType<typeof stubMockupRuntime>;

  beforeEach(async () => {
    runtime = stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", mockupState({ pages: [LIST, DETAIL, EDIT] }));
    await viewer.say({ type: "ready" });
  });

  afterEach(() => {
    viewer?.unmount();
    viewer = undefined;
    vi.unstubAllGlobals();
  });

  it("opens the page a link of the preview names, on its row, as a new entry of the history, and back returns to the list (fails when ?page= stays put)", async () => {
    await viewer?.say({ type: "navigate", id: "order", record: "o2" });

    expect(runtime.pushes.at(-1)).toEqual({
      name: "demo",
      page: "order",
      record: "o2",
    });
    expect(rendered(viewer?.posted ?? []).at(-1)).toMatchObject({
      tree: DETAIL.tree,
      params: { id: "o2" },
    });

    runtime.route.query = { name: "demo", page: "orders" };
    await flush();
    const back = rendered(viewer?.posted ?? []).at(-1);
    expect(back?.tree).toEqual(LIST.tree);
    expect(back).not.toHaveProperty("params");
  });

  it("opens a detail page's own sub-page on the row on screen when its link names none, and a page of another branch on its sample row (fails when the edit page shows another row)", async () => {
    await viewer?.say({ type: "navigate", id: "order", record: "o2" });
    await viewer?.say({ type: "navigate", id: "order-edit" });
    expect(runtime.pushes.at(-1)).toEqual({
      name: "demo",
      page: "order-edit",
      record: "o2",
    });

    await viewer?.say({ type: "navigate", id: "orders" });
    await viewer?.say({ type: "navigate", id: "order-edit" });
    expect(runtime.pushes.at(-1)).toEqual({ name: "demo", page: "order-edit" });
  });

  it("shows a page with a route on its sample row when no link named one", async () => {
    await viewer?.say({ type: "navigate", id: "order" });

    expect(runtime.pushes.at(-1)).toEqual({ name: "demo", page: "order" });
    expect(rendered(viewer?.posted ?? []).at(-1)?.params).toEqual({ id: "o1" });
  });

  it("hands every click to the page in Preview, with no panel, and leaves it on the toggle or on Escape from the frame (fails when Preview still selects)", async () => {
    const find = (selector: string) => viewer?.host.querySelector(selector);
    const inspecting = () =>
      viewer?.posted.filter((message) => message.type === "inspect").at(-1);
    const toggle = () => {
      const button = find("[data-dms-mockup-preview-toggle]");
      if (button instanceof HTMLElement) button.click();
      return flush();
    };

    await toggle();
    expect(inspecting()).toMatchObject({ enabled: false });
    expect(find("[data-dms-mockup-edit-panel]")).toBeNull();
    expect(find("[data-dms-mockup-inspector]")).toBeNull();
    expect(
      find("[data-dms-mockup-preview-toggle]")?.getAttribute("aria-pressed"),
    ).toBe("true");

    await viewer?.say({ type: "escape" });
    expect(inspecting()).toMatchObject({ enabled: true });

    await toggle();
    await toggle();
    expect(inspecting()).toMatchObject({ enabled: true });
  });
});

describe("sub-pages", () => {
  const keys = {
    idOf: (page: { id: string }) => page.id,
    parentOf: (page: { parent?: string }) => page.parent,
  };

  it("nests each sub-page under its parent, depth first, and stands a page with an unknown parent or a loop of parents on its own (fails when a page is listed twice or lost)", () => {
    const forest = pageForest(
      [
        { id: "orders" },
        { id: "edit", parent: "order" },
        { id: "order", parent: "orders" },
        { id: "orphan", parent: "nowhere" },
        { id: "a", parent: "b" },
        { id: "b", parent: "a" },
      ],
      keys,
    );

    expect(forest.roots.map((page) => page.id)).toEqual([
      "orders",
      "orphan",
      "a",
      "b",
    ]);
    expect(
      forest
        .descendants("orders")
        .map(({ page, depth }) => `${page.id}:${depth}`),
    ).toEqual(["order:1", "edit:2"]);
    expect(forest.descendants("a")).toEqual([]);
  });

  it("writes a move among the top pages before the same top page among all of them, so a sub-page stays after its parent", () => {
    const others = ["orders", "order", "customers"];
    const roots = ["orders", "customers"];

    expect(topMoveIndex(others, roots, 0)).toBe(0);
    expect(topMoveIndex(others, roots, 1)).toBe(2);
    expect(topMoveIndex(others, roots, 2)).toBe(3);
  });
});

describe("sub-pages in the viewer", () => {
  let viewer: MountedViewer | undefined;
  let runtime: ReturnType<typeof stubMockupRuntime>;
  const find = (selector: string) =>
    viewer?.host.querySelector<HTMLElement>(selector);

  beforeEach(async () => {
    runtime = stubMockupRuntime({
      spec: {
        version: 1,
        pages: [
          { id: "orders", title: "Orders", tree: [] },
          {
            id: "order",
            title: "Order",
            menu: false,
            parent: "orders",
            route: ":id",
            tree: [],
          },
          { id: "customers", title: "Customers", tree: [] },
        ],
      },
    });
    viewer = await mountViewer();
    await viewer.publish(
      "state",
      mockupState({
        pages: [
          LIST,
          DETAIL,
          mockupPage({ id: "customers", title: "Customers", paths: {} }),
        ],
      }),
    );
    await viewer.say({ type: "ready" });
    find('[data-dms-mockup-panel-tab="pages"]')?.click();
    await flush();
  });

  afterEach(() => {
    viewer?.unmount();
    viewer = undefined;
    vi.unstubAllGlobals();
  });

  it("lists a hidden detail page under its parent, marked hidden, and moving the top page below keeps it there (fails when it is listed as a top page)", async () => {
    const rows = () =>
      [
        ...(viewer?.host.querySelectorAll("[data-dms-mockup-page-row]") ?? []),
      ].map((row) => row.getAttribute("data-dms-mockup-page-row"));
    const detail = find('[data-dms-mockup-page-row="order"]');

    expect(rows()).toEqual(["orders", "order", "customers"]);
    expect(detail?.getAttribute("data-dms-mockup-page-parent")).toBe("orders");
    expect(
      detail?.querySelector("[data-dms-mockup-page-hidden]"),
    ).not.toBeNull();
    expect(
      find('[data-dms-mockup-page-row="orders"] [data-dms-mockup-page-hidden]'),
    ).toBeNull();

    const moveUp = find(
      '[data-dms-mockup-page-row="customers"] [aria-label="dms.mockup.move_up"]',
    );
    moveUp?.click();
    await new Promise((resolve) =>
      setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
    );
    await flush();

    expect(runtime.file.spec.pages.map((page) => page.id)).toEqual([
      "customers",
      "orders",
      "order",
    ]);
  });

  it("lays a sub-page out right after its parent in the Overview, its frame naming the parent and marked hidden (fails when it waits at the end of the row)", async () => {
    await viewer?.publish(
      "state",
      mockupState({
        revision: 2,
        pages: [
          LIST,
          mockupPage({ id: "customers", title: "Customers", paths: {} }),
          DETAIL,
        ],
      }),
    );
    find("[data-dms-mockup-close-page]")?.click();
    await flush();
    const frames = [
      ...(viewer?.host.querySelectorAll("[data-dms-mockup-overview-frame]") ??
        []),
    ];
    const detail = find('[data-dms-mockup-overview-frame="order"]');

    expect(
      frames.map((frame) =>
        frame.getAttribute("data-dms-mockup-overview-frame"),
      ),
    ).toEqual(["orders", "order", "customers"]);
    expect(
      detail?.querySelector("[data-dms-mockup-overview-parent]")?.textContent,
    ).toContain("Orders");
    expect(
      detail?.querySelector("[data-dms-mockup-overview-hidden]"),
    ).not.toBeNull();
  });
});
