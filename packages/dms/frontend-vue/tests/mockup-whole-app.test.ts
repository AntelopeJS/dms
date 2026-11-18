/** @vitest-environment jsdom */
import { createApp, defineComponent, h, type App } from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MockupSidebarMenu from "../layers/dms-layout/app/entries/components/layout/MockupSidebarMenu";
import { mockupMenu } from "../layers/dms-layout/app/entries/components/layout/mockupMenu";
import type { MockupPageState } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  mockupNavigation,
  mockupPageRender,
  pagesToBuild,
} from "../layers/dms-ui/app/entries/utils/mockupFrame";
import { bareFrameUrl } from "../layers/dms-ui/app/entries/utils/liveFrame";
import { flush, registerMenu, stubMenuRuntime } from "./helpers/mockup-sidebar";

function page(
  id: string,
  fields: Partial<MockupPageState> = {},
): MockupPageState {
  return {
    id,
    title: id.toUpperCase(),
    options: {},
    tree: [],
    paths: {},
    ...fields,
  };
}

/** A whole-platform mockup: Home live, Orders converted and edited, Forecast new, Stock live under Ops. */
const WHOLE_APP: MockupPageState[] = [
  page("home", { live: { ref: "/home" } }),
  page("orders", { livePage: { ref: "/orders" } }),
  page("forecast"),
  page("stock", { category: "ops", live: { ref: "/stock" } }),
];

const CATEGORIES = [{ id: "ops", title: "Operations" }];

/** The app's own menu, which a whole-platform mockup already stands for. */
const APP_MENU: NavigationMenuItem[][] = [
  [
    { id: "pages", label: "Pages", type: "label" },
    { id: "home", label: "Home", to: "/home" },
    { id: "orders", label: "Orders", to: "/orders" },
  ],
];

function navigationOf(pages: MockupPageState[]) {
  return mockupNavigation({
    title: "Shop",
    categories: CATEGORIES,
    pages,
    active: "orders",
  });
}

const UBadge = defineComponent({
  props: { label: { type: String, default: "" } },
  setup: (props) => () => h("span", props.label),
});

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  stubMenuRuntime();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("a whole-platform mockup's sidebar", () => {
  it("marks each page Live, Edited or New, and the navigation as the whole app (fails when a live reference reads as a mockup page)", () => {
    const navigation = navigationOf(WHOLE_APP);

    expect(navigation.wholeApp).toBe(true);
    expect(
      navigation.sections.map((section) =>
        section.items.map((item) => [item.id, item.status]),
      ),
    ).toEqual([
      [
        ["home", "live"],
        ["orders", "edited"],
        ["forecast", "new"],
      ],
      [["stock", "live"]],
    ]);
  });

  it("keeps a mockup with no live reference page as it was: no status, merged with the app's menu (fails when an old mockup gets badges)", () => {
    const navigation = navigationOf([page("orders"), page("forecast")]);

    expect(navigation.wholeApp).toBeUndefined();
    expect(
      navigation.sections.flatMap((section) =>
        section.items.map((item) => item.status),
      ),
    ).toEqual([undefined, undefined]);
  });

  it("lists the mockup's own menu alone: no app entry dimmed beside it, nothing appended (fails when the app's menu is merged in)", () => {
    const { groups } = mockupMenu(navigationOf(WHOLE_APP), APP_MENU, {
      defaultSection: "Pages",
      select: () => {},
    });

    expect(
      groups.map((group) =>
        group.map((item) => `${String(item.label)}${item.disabled ? " (app)" : ""}`),
      ),
    ).toEqual([["HOME", "ORDERS", "FORECAST"], ["Operations", "STOCK"]]);
  });

  it("draws a badge on each page's entry, by its status (fails when an entry has none)", async () => {
    app = createApp({
      render: () =>
        h(MockupSidebarMenu, {
          navigation: navigationOf(WHOLE_APP),
          existing: APP_MENU,
          collapsed: false,
          open: [],
        }),
    });
    registerMenu(app);
    app.component("UBadge", UBadge);
    app.mount(host);
    await flush();

    const badges = [
      ...host.querySelectorAll<HTMLElement>("[data-dms-mockup-page-status]"),
    ].map((badge) => [
      badge.closest("[data-dms-preview-page]")?.getAttribute(
        "data-dms-preview-page",
      ),
      badge.textContent,
    ]);
    expect(badges).toEqual([
      ["home", "dms.mockup.page_status.live"],
      ["orders", "dms.mockup.page_status.edited"],
      ["forecast", "dms.mockup.page_status.new"],
      ["stock", "dms.mockup.page_status.live"],
    ]);
  });
});

describe("a whole-platform mockup's pages", () => {
  it("draws a live reference page as its live page, its status in the top bar (fails when it is drawn as an empty tree)", () => {
    const navigation = navigationOf(WHOLE_APP);
    const [home] = WHOLE_APP;
    if (!home) throw new Error("no home page");

    const render = mockupPageRender(home, [], navigation);

    expect(render.live).toBe("/home");
    expect(render.header?.status).toBe("live");
  });

  it("opens the live page bare, its own query kept", () => {
    expect(bareFrameUrl("/orders?status=open")).toBe(
      "/orders?status=open&dms-frame=bare",
    );
  });

  it("builds the edited and new pages alone, never a live reference (fails when Build it hands a live page to the build)", () => {
    expect(pagesToBuild(WHOLE_APP)).toEqual(['"ORDERS"', '"FORECAST"']);
    expect(pagesToBuild([page("orders")])).toBeUndefined();
  });
});
