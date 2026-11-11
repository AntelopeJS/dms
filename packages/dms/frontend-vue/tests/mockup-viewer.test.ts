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
    expect(viewer.stream.url).toBe("http://backend/api/mockup/demo/events");
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
    expect(src).toBe("/dms-preview");
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
    expect(viewer.host.querySelector("[data-dms-mockup-page]")).not.toBeNull();
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
  it("draws the page its tab names, with that page's theme", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", TWO_PAGES);
    await viewer.say({ type: "ready" });
    const [, settingsTab] = viewer.host.querySelectorAll<HTMLElement>(
      "[data-dms-mockup-page]",
    );
    settingsTab.click();
    await flush();
    expect(rendered(viewer.posted).at(-1)).toMatchObject({
      tree: [MARGIN],
      theme: "light",
    });
    expect(settingsTab.getAttribute("aria-pressed")).toBe("true");
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
