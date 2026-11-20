/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import {
  parseMockupState,
  specPointerFor,
} from "../layers/dms-ui/app/entries/utils/mockup";
import {
  FakeEventSource,
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  rendered,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

let viewer: MountedViewer | undefined;

afterEach(() => {
  viewer?.unmount();
  viewer = undefined;
  vi.unstubAllGlobals();
});

const REVENUE = { type: "KpiCard", options: { title: "Revenue" } };
const MARGIN = { type: "KpiCard", options: { title: "Margin" } };

const TWO_PAGES = mockupState({
  pages: [
    mockupPage({ tree: [REVENUE] }),
    mockupPage({
      id: "settings",
      title: "Settings",
      options: { theme: "light" },
      tree: [MARGIN],
    }),
  ],
});

describe("live render", () => {
  beforeEach(() => {
    stubMockupRuntime();
  });

  it("opens the mockup's event stream on the backend", async () => {
    viewer = await mountViewer();
    expect(viewer.stream.url).toMatch(
      /^http:\/\/backend\/api\/mockup\/demo\/events\?viewer=[0-9a-f-]{36}$/,
    );
  });

  it("posts the page's tree, theme and locale on each state, leaving the iframe alone", async () => {
    viewer = await mountViewer();
    const { iframe, posted, publish, say } = viewer;
    const src = iframe.getAttribute("src");
    await publish(
      "state",
      mockupState({ pages: [mockupPage({ tree: [REVENUE] })] }),
    );
    await say({ type: "ready" });
    expect(rendered(posted).at(-1)).toMatchObject({
      tree: [REVENUE],
      theme: "dark",
      locale: "fr-FR",
    });

    await publish(
      "state",
      mockupState({
        revision: 2,
        pages: [mockupPage({ tree: [REVENUE, MARGIN] })],
      }),
    );
    expect(rendered(posted).at(-1)?.tree).toEqual([REVENUE, MARGIN]);
    expect(rendered(posted)).toHaveLength(2);
    expect(viewer.host.querySelector("iframe")).toBe(iframe);
    expect(iframe.getAttribute("src")).toBe(src);
    expect(src).toBe("/dms-preview?fixtures=only");
  });

  it("sends each page's padding, padded when the page says nothing", async () => {
    viewer = await mountViewer();
    const { posted, publish, say } = viewer;
    await say({ type: "ready" });
    await publish(
      "state",
      mockupState({
        pages: [mockupPage({ options: { theme: "dark", padding: false } })],
      }),
    );
    expect(rendered(posted).at(-1)?.padding).toBe(false);

    await publish("state", mockupState({ revision: 2, pages: [mockupPage()] }));
    expect(rendered(posted).at(-1)?.padding).toBe(true);
  });

  it("holds a state that arrives before the preview is ready, then draws it", async () => {
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    expect(viewer.posted).toEqual([]);
    await viewer.say({ type: "ready" });
    expect(rendered(viewer.posted)).toHaveLength(1);
  });

  it("answers a preview that reloaded and says ready again", async () => {
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await viewer.say({ type: "ready" });
    expect(rendered(viewer.posted)).toHaveLength(2);
  });

  it("ignores a state that is not a compiled mockup and keeps the last good one", async () => {
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await viewer.publish("state", { name: "demo", revision: 2, pages: "oops" });
    expect(rendered(viewer.posted)).toHaveLength(1);
    expect(viewer.host.textContent).not.toContain("dms.mockup.waiting");
  });

  it("ignores a preview message that does not come from its iframe", async () => {
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: "dms-preview", type: "ready" },
        source: window,
      }),
    );
    await flush();
    expect(viewer.posted).toEqual([]);
  });

  it("closes the stream when the viewer goes", async () => {
    viewer = await mountViewer();
    const { stream } = viewer;
    viewer.unmount();
    viewer = undefined;
    expect(stream.readyState).toBe(FakeEventSource.CLOSED);
  });
});

describe("pages, width and size", () => {
  it("draws the mockup's pages as the preview's sidebar, home first (fails when the sidebar lists no pages or marks none current)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", TWO_PAGES);
    await viewer.say({ type: "ready" });
    expect(rendered(viewer.posted).at(-1)?.navigation).toEqual({
      title: "demo",
      sections: [
        {
          items: [
            { id: "orders", label: "Orders", icon: "i-ph-house-light" },
            { id: "settings", label: "Settings", icon: undefined },
          ],
        },
      ],
      active: "orders",
      editable: true,
    });
  });

  it("draws each page's own icon in the sidebar, the default only for a page without one (fails when every page but home shows a file icon)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish(
      "state",
      mockupState({
        pages: [
          mockupPage({ id: "overview", title: "Overview" }),
          mockupPage({ id: "orders", title: "Orders", icon: "i-ph-receipt" }),
          mockupPage({ id: "notes", title: "Notes" }),
        ],
      }),
    );
    await viewer.say({ type: "ready" });
    expect(rendered(viewer.posted).at(-1)?.navigation?.sections).toEqual([
      {
        items: [
          { id: "overview", label: "Overview", icon: "i-ph-house-light" },
          { id: "orders", label: "Orders", icon: "i-ph-receipt" },
          { id: "notes", label: "Notes", icon: undefined },
        ],
      },
    ]);
  });

  it("draws the page the sidebar picks, with that page's theme (fails when a sidebar click switches nothing)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", TWO_PAGES);
    await viewer.say({ type: "ready" });
    await viewer.say({ type: "navigate", id: "settings" });
    expect(rendered(viewer.posted).at(-1)).toMatchObject({
      tree: [MARGIN],
      theme: "light",
      navigation: { active: "settings" },
    });
  });

  it("opens the page and the width the URL names", async () => {
    stubMockupRuntime({
      query: { name: "demo", page: "settings", width: "mobile" },
    });
    viewer = await mountViewer();
    await viewer.publish("state", TWO_PAGES);
    await viewer.say({ type: "ready" });
    expect(rendered(viewer.posted).at(-1)?.tree).toEqual([MARGIN]);
    expect(viewer.iframe.style.width).toBe("390px");
  });

  it("falls back to the first page and the desktop width for names it does not know", async () => {
    stubMockupRuntime({
      query: { name: "demo", page: "gone", width: "tablet" },
    });
    viewer = await mountViewer();
    await viewer.publish("state", TWO_PAGES);
    await viewer.say({ type: "ready" });
    expect(rendered(viewer.posted).at(-1)?.tree).toEqual([REVENUE]);
    expect(viewer.iframe.style.width).toBe("1280px");
  });

  it("switches the frame between desktop and mobile width", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", TWO_PAGES);
    const [, mobile] = viewer.host.querySelectorAll<HTMLElement>(
      "[data-dms-mockup-width]",
    );
    mobile.click();
    await flush();
    expect(viewer.iframe.style.width).toBe("390px");
  });

  it("follows the height the preview reports, never below a floor", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", TWO_PAGES);
    await viewer.say({ type: "resize", height: 910 });
    expect(viewer.iframe.style.height).toBe("910px");
    await viewer.say({ type: "resize", height: 12 });
    expect(viewer.iframe.style.height).toBe("240px");
  });
});

describe("issues", () => {
  it("lists each issue with its path and message, and counts them", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish(
      "state",
      mockupState({
        issues: [
          { path: "/pages/0/tree/1/options/title", message: "Required" },
          { path: "", message: "Unreadable JSON" },
        ],
      }),
    );
    const rows = [
      ...viewer.host.querySelectorAll("[data-dms-mockup-issue]"),
    ].map((row) => row.textContent?.replace(/\s+/g, " ").trim());
    expect(rows).toEqual([
      "/pages/0/tree/1/options/title Required",
      "/ Unreadable JSON",
    ]);
    expect(
      viewer.host.querySelector("[data-dms-mockup-issue-count]")?.textContent,
    ).toContain("2");
  });
});

describe("without a name", () => {
  it("lists the mockups as links to their viewers and opens no stream", async () => {
    stubMockupRuntime({
      query: {},
      mockups: [
        { name: "order-desk", title: "Order desk", pages: 2 },
        { name: "login", pages: 1 },
      ],
    });
    const { default: MockupViewer } = await import(
      "../layers/dms-ui/app/components/block-preview/MockupViewer.vue"
    );
    const host = document.createElement("div");
    const app = createApp(MockupViewer);
    app.mount(host);
    await flush();
    const links = [...host.querySelectorAll("a[data-dms-mockup-link]")].map(
      (link) => [link.textContent?.trim(), link.getAttribute("href")],
    );
    app.unmount();
    expect(links).toEqual([
      ["Order desk", "/mockup?name=order-desk"],
      ["login", "/mockup?name=login"],
    ]);
    expect(FakeEventSource.instances).toEqual([]);
  });
});

describe("layout path to spec pointer", () => {
  const page = mockupPage({
    paths: {
      "block-0": "/pages/0/tree/0",
      "block-1.kpi": "/pages/0/tree/1/children/0",
    },
  });

  it("maps a layout path to the pointer the compiler recorded for it", () => {
    expect(specPointerFor(page, "block-1.kpi")).toBe(
      "/pages/0/tree/1/children/0",
    );
    expect(specPointerFor(page, "block-0")).toBe("/pages/0/tree/0");
  });

  it("answers nothing for a path the tree has no node at, inherited names included", () => {
    expect(specPointerFor(page, "block-9")).toBeUndefined();
    expect(specPointerFor(page, "constructor")).toBeUndefined();
    expect(specPointerFor(page, "__proto__")).toBeUndefined();
  });

  it("refuses a state whose paths hold something other than pointers", () => {
    const bad = {
      ...mockupState(),
      pages: [{ ...page, paths: { "block-0": 3 } }],
    };
    expect(parseMockupState(bad)).toBeUndefined();
    expect(parseMockupState(mockupState())).toMatchObject({ name: "demo" });
  });
});

describe("a generated form page's state", () => {
  const stateOf = (generated: boolean) => ({
    ...mockupState(),
    pages: [{ ...mockupPage(), generated }],
  });

  it("keeps the flag of a page the mockup drew itself and refuses any other value (fails when the state is refused or the flag dropped)", () => {
    expect(parseMockupState(stateOf(true))?.pages[0]).toMatchObject({
      generated: true,
    });
    expect(parseMockupState(stateOf(false))).toBeUndefined();
  });
});

describe("one viewer", () => {
  it("goes back to the mockups from the top bar (fails when the viewer is a dead end)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    expect(
      viewer.host.querySelector("[data-dms-mockup-back]")?.getAttribute("to"),
    ).toBe("/mockups");
  });

  it("selects the clicked block for editing even from a URL that still says ?mode=comment (fails when a stale mode opens a comment box)", async () => {
    stubMockupRuntime({ query: { name: "demo", mode: "comment" } });
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await viewer.say({ type: "select", path: "block-0" });
    await viewer.say({
      type: "layout",
      blocks: [
        { path: "block-0", rect: { x: 0, y: 0, width: 200, height: 80 } },
      ],
    });
    expect(viewer.host.querySelector("[data-dms-mockup-selection]")).not.toBe(
      null,
    );
    expect(viewer.host.querySelector("textarea")).toBeNull();
  });

  it("says the AI is writing the mockup while its spec has no page, then draws the first page it writes (fails when an empty spec shows nothing)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", mockupState({ pages: [] }));
    expect(
      viewer.host.querySelector("[data-dms-mockup-empty]")?.textContent,
    ).toContain("dms.mockup.writing");

    await viewer.publish("state", mockupState({ revision: 2 }));
    await viewer.say({ type: "ready" });
    expect(viewer.host.querySelector("[data-dms-mockup-empty]")).toBeNull();
    expect(rendered(viewer.posted).at(-1)?.tree).toEqual([
      { type: "KpiCard", options: { title: "Revenue" } },
    ]);
  });
});

describe("side panels of the viewer", () => {
  beforeEach(() => localStorage.clear());

  const shown = () => ({
    left: viewer?.host.querySelector("[data-dms-mockup-edit-panel]") !== null,
    right: viewer?.host.querySelector("[data-dms-mockup-inspector]") !== null,
  });

  function press(key: string): Promise<void> {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    return flush();
  }

  it("closes and opens each panel from the top bar and from [ and ] (fails when a panel cannot close)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    expect(shown()).toEqual({ left: true, right: true });

    viewer.host
      .querySelector<HTMLElement>('[data-dms-mockup-panel-toggle="left"]')
      ?.click();
    await press("]");
    expect(shown()).toEqual({ left: false, right: false });

    await press("[");
    expect(shown()).toEqual({ left: true, right: false });
  });

  it("keeps the panels as they were left on the next visit, and a selection does not reopen the inspector (fails when the choice is lost on reload)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await press("]");
    viewer.unmount();

    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await viewer.say({ type: "select", path: "block-0" });

    expect(shown()).toEqual({ left: true, right: false });
  });

  it("marks itself as a surface the side panel docks beside (fails when the assistant's panel hides on /mockup)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    const root = viewer.host.querySelector<HTMLElement>(
      "[data-dms-docks-side-panel]",
    );
    expect(root?.querySelector("[data-dms-mockup-viewer]")).not.toBeNull();
  });
});
