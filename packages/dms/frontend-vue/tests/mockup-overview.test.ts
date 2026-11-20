/** @vitest-environment jsdom */
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockupAnnotation } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  FakeEventSource,
  flush,
  mockupState,
  rendered,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";
import {
  mountOverviewViewer,
  overviewDriver,
  overviewPages,
  remountOverviewViewer,
  VIEWPORT,
} from "./helpers/mockup-overview";

const HISTORY_URL = "/api/mockup/demo/history";

let runtime: MockupRuntime;
let viewer: MountedViewer;

const {
  find,
  findAll,
  overview,
  press,
  openOverview,
  camera,
  frameRect,
  onScreen,
  pointer,
  frameIds,
  isInView,
  wheel,
  click,
  measure,
} = overviewDriver(() => viewer);

async function mount(
  count: number,
  options: { notes?: MockupAnnotation[]; query?: Record<string, string> } = {},
): Promise<void> {
  ({ viewer, runtime } = await mountOverviewViewer(
    count,
    options.notes,
    options.query,
  ));
}

/** The page the page view draws, as its last render names it in the sidebar. */
const shownPage = () => rendered(viewer.posted).at(-1)?.navigation?.active;

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

const writes = () =>
  runtime.authFetch.mock.calls.filter(([, init]) => init?.method);

const HOME = { name: "demo" };

describe("opening the overview", () => {
  it("follows the mockup on one stream, however many pages its Overview draws (fails when a frame of the Overview opens a stream of its own)", async () => {
    await mount(12, { query: HOME });
    await measure();

    expect(frameIds()).toHaveLength(12);
    expect(FakeEventSource.instances.map((source) => source.url)).toEqual([
      viewer.stream.url,
    ]);
  });

  it("opens a mockup on its Overview, every page a frame in the sidebar's order under its title, with no Overview button (fails when the mockup opens on a page, or a page is missing or out of order)", async () => {
    await mount(5, { query: HOME });
    await measure();

    expect(overview()).not.toBeNull();
    expect(find("[data-dms-mockup-canvas]")?.style.display).toBe("none");
    expect(find("[data-dms-mockup-close-page]")).toBeNull();
    expect(frameIds()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(
      findAll("[data-dms-mockup-overview-title]").map((title) =>
        title.textContent?.trim(),
      ),
    ).toEqual(["Page 1", "Page 2", "Page 3", "Page 4", "Page 5"]);
    expect(find("[data-dms-mockup-overview-toggle]")).toBeNull();
    expect(await press("o")).toBe(false);
    expect(overview()).not.toBeNull();
  });

  it("opens straight on the page a URL names, and back and forward step between it and the Overview (fails when ?page= is ignored or going back stays on the page)", async () => {
    await mount(5, { query: { name: "demo", page: "p3" } });

    expect(overview()).toBeNull();
    expect(shownPage()).toBe("p3");
    expect(find("[data-dms-mockup-close-page]")).not.toBeNull();

    runtime.route.query = { ...HOME };
    await flush();
    expect(overview()).not.toBeNull();

    runtime.route.query = { name: "demo", page: "p3" };
    await flush();
    expect(overview()).toBeNull();
    expect(shownPage()).toBe("p3");
  });

  it("goes back from a page to the Overview with the page's ✕, as a new entry of the browser's history, the ✕ showing Escape in its tooltip (fails when the ✕ does nothing or replaces the page's entry)", async () => {
    await mount(5);
    expect(
      find("[data-dms-mockup-close-page]")
        ?.closest("[data-tooltip]")
        ?.getAttribute("data-tooltip-kbds"),
    ).toBe('["Esc"]');

    await openOverview();

    expect(overview()).not.toBeNull();
    expect(runtime.pushes).toEqual([HOME]);
  });
  it("fits every page in view on opening, wrapping ten pages into two rows, and Shift+1 or the fit button fits them again after a pan (fails when a frame opens cut off or Shift+1 does nothing)", async () => {
    await mount(10);
    await openOverview();

    const ids = frameIds().flatMap((id) => (id ? [id] : []));
    expect(new Set(ids.map((id) => frameRect(id).y)).size).toBe(2);
    expect(ids.every(isInView)).toBe(true);

    await wheel({ deltaX: 3000 });
    expect(ids.every(isInView)).toBe(false);
    expect(await press("!", { code: "Digit1", shiftKey: true })).toBe(true);
    expect(ids.every(isInView)).toBe(true);

    await wheel({ deltaY: 2000 });
    await click("[data-dms-mockup-overview-fit]");
    expect(ids.every(isInView)).toBe(true);
    expect(
      find("[data-dms-mockup-overview-fit]")
        ?.closest("[data-tooltip]")
        ?.getAttribute("data-tooltip-kbds"),
    ).toBe('["Shift","1"]');
  });
});

describe("the sections", () => {
  it("lays each section's pages out in a row of their own under its title, in the menu's order, and fits them with the first title in view (fails when sections share a row or the first title is cut off)", async () => {
    await mount(4);
    const categories = [
      { id: "sales", title: "Sales" },
      { id: "admin", title: "Admin" },
      { id: "empty", title: "Empty" },
    ];
    const sectionOf = ["admin", undefined, "sales", "sales"];
    await viewer.publish(
      "state",
      mockupState({
        categories,
        pages: overviewPages(4).map((page, index) => ({
          ...page,
          category: sectionOf[index],
        })),
      }),
    );

    await openOverview();

    expect(
      findAll("[data-dms-mockup-overview-section-title]").map((title) =>
        title.textContent?.trim(),
      ),
    ).toEqual(["dms.mockup.section_default", "Sales", "Admin"]);
    expect(frameIds()).toEqual(["p2", "p3", "p4", "p1"]);
    expect(frameRect("p3").y).toBe(frameRect("p4").y);
    expect(frameRect("p3").y).toBeGreaterThan(frameRect("p2").y);
    expect(frameRect("p1").y).toBeGreaterThan(frameRect("p3").y);
    expect(onScreen("p2", { x: 0, y: 0 }).y).toBeGreaterThanOrEqual(80);
  });
});

describe("the frame titles", () => {
  it("draws each page's own icon before its title, else the icon its sidebar entry has (fails when a frame title has no icon or a generic one)", async () => {
    await mount(3);
    await viewer.publish(
      "state",
      mockupState({
        pages: overviewPages(3).map((page, index) =>
          index === 1 ? { ...page, icon: "i-ph-receipt" } : page,
        ),
      }),
    );

    await openOverview();

    expect(
      findAll("[data-dms-mockup-overview-title-icon]").map((icon) =>
        icon.getAttribute("name"),
      ),
    ).toEqual(["i-ph-house-light", "i-ph-receipt", "i-ph-file-light"]);
  });
});

describe("moving around", () => {
  it("zooms around the pointer with Ctrl and the wheel, and shows the zoom (fails when the point under the pointer drifts)", async () => {
    await mount(5);
    await openOverview();
    const before = camera();
    const at = { x: 700, y: 350 };
    const worldBefore = {
      x: (at.x - before.x) / before.zoom,
      y: (at.y - before.y) / before.zoom,
    };

    await wheel({ ctrlKey: true, deltaY: -20, clientX: at.x, clientY: at.y });

    const after = camera();
    expect(after.zoom).toBeGreaterThan(before.zoom);
    expect((at.x - after.x) / after.zoom).toBeCloseTo(worldBefore.x);
    expect((at.y - after.y) / after.zoom).toBeCloseTo(worldBefore.y);
    expect(
      find("[data-dms-mockup-overview-zoom-level]")?.textContent?.trim(),
    ).toBe(`${Math.round(after.zoom * 100)}%`);

    await click("[data-dms-mockup-overview-zoom-in]");
    expect(camera().zoom).toBeCloseTo(after.zoom * 1.5);
    await click("[data-dms-mockup-overview-zoom-out]");
    expect(camera().zoom).toBeCloseTo(after.zoom);
  });

  it("pans with the wheel, the arrow keys, Space and a drag, and a middle-button drag (fails when a drag without Space pans)", async () => {
    await mount(5);
    await openOverview();
    const start = camera();

    await wheel({ deltaX: 30, deltaY: 40 });
    expect(camera()).toMatchObject({ x: start.x - 30, y: start.y - 40 });

    await press("ArrowRight");
    expect(camera().x).toBe(start.x - 30 - 80);

    const view = overview();
    view?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    view?.dispatchEvent(pointer("pointermove", { x: 160, y: 100 }));
    view?.dispatchEvent(pointer("pointerup", { x: 160, y: 100 }));
    await flush();
    expect(camera().x).toBe(start.x - 110);

    await press(" ", { code: "Space" });
    const grab = find("[data-dms-mockup-overview-pan]");
    expect(grab).not.toBeNull();
    grab?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    grab?.dispatchEvent(pointer("pointermove", { x: 150, y: 130 }));
    grab?.dispatchEvent(pointer("pointerup", { x: 150, y: 130 }));
    window.dispatchEvent(
      new KeyboardEvent("keyup", { key: " ", code: "Space" }),
    );
    await flush();
    expect(camera()).toMatchObject({ x: start.x - 60, y: start.y - 10 });
    expect(find("[data-dms-mockup-overview-pan]")).toBeNull();

    view?.dispatchEvent(pointer("pointerdown", { x: 0, y: 0 }, { button: 1 }));
    view?.dispatchEvent(pointer("pointermove", { x: 20, y: 0 }));
    view?.dispatchEvent(pointer("pointerup", { x: 20, y: 0 }));
    await flush();
    expect(camera().x).toBe(start.x - 40);
  });

  it("brings a frame focused from the keyboard into view (fails when Tab leaves the focused frame off screen)", async () => {
    await mount(5);
    await openOverview();
    await wheel({ ctrlKey: true, deltaY: -25, clientX: 0, clientY: 0 });
    await wheel({ ctrlKey: true, deltaY: -25, clientX: 0, clientY: 0 });
    await wheel({ ctrlKey: true, deltaY: -25, clientX: 0, clientY: 0 });
    expect(isInView("p4")).toBe(false);

    find('[data-dms-mockup-overview-frame="p4"]')?.focus();
    await flush();

    const rect = frameRect("p4");
    const left = onScreen("p4", { x: 0, y: 0 });
    const right = onScreen("p4", { x: rect.width, y: 0 });
    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(right.x).toBeLessThanOrEqual(VIEWPORT.width);
  });
});

describe("leaving the overview for a page", () => {
  it("opens the page of a double-clicked frame in the page view (fails when the overview stays or another page opens)", async () => {
    await mount(5);
    await openOverview();

    find('[data-dms-mockup-overview-frame="p4"]')?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    await flush();

    expect(overview()).toBeNull();
    expect(shownPage()).toBe("p4");
  });

  it("opens the page of a frame focused with Enter", async () => {
    await mount(5);
    await openOverview();

    find('[data-dms-mockup-overview-frame="p2"]')?.focus();
    await press("Enter");

    expect(overview()).toBeNull();
    expect(shownPage()).toBe("p2");
  });
});

describe("the Overview as the mockup's home", () => {
  const openButton = (id: string) =>
    find(
      `[data-dms-mockup-overview-frame="${id}"] [data-dms-mockup-overview-open]`,
    );

  it("shows Open on the frame hovered, and on the frame picked with a click, and Open opens its page (fails when Open is missing or opens another page)", async () => {
    await mount(4, { query: HOME });
    await measure();
    expect(findAll("[data-dms-mockup-overview-open]")).toEqual([]);

    find('[data-dms-mockup-overview-frame="p2"]')?.dispatchEvent(
      new PointerEvent("pointerenter"),
    );
    await flush();
    expect(openButton("p2")).not.toBeNull();
    find('[data-dms-mockup-overview-frame="p2"]')?.dispatchEvent(
      new PointerEvent("pointerleave"),
    );
    await flush();
    expect(openButton("p2")).toBeNull();

    await click('[data-dms-mockup-overview-frame="p3"]');
    expect(
      find('[data-dms-mockup-overview-frame="p3"]')?.hasAttribute(
        "data-picked",
      ),
    ).toBe(true);
    expect(overview()).not.toBeNull();
    openButton("p3")?.click();
    await flush();

    expect(overview()).toBeNull();
    expect(shownPage()).toBe("p3");
    expect(runtime.pushes).toEqual([{ ...HOME, page: "p3" }]);
  });

  it("goes back to the Overview at the pan and zoom it had when a page was opened from it (fails when it fits every page again)", async () => {
    await mount(5, { query: HOME });
    await measure();
    await wheel({ deltaX: 300, deltaY: 200 });
    await wheel({ deltaY: -60, ctrlKey: true, clientX: 300, clientY: 200 });
    const before = camera();

    find('[data-dms-mockup-overview-frame="p2"]')?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    await flush();
    expect(overview()).toBeNull();
    await openOverview({ boot: false });

    expect(camera()).toEqual(before);
  });

  it("goes back to the Overview at the pan and zoom it had after a step of the browser's history rebuilt the viewer on a page (fails when the rebuilt viewer fits every page again)", async () => {
    await mount(5, { query: HOME });
    await measure();
    await wheel({ deltaX: 300, deltaY: 200 });
    await wheel({ deltaY: -60, ctrlKey: true, clientX: 300, clientY: 200 });
    const before = camera();
    find('[data-dms-mockup-overview-frame="p2"]')?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    await flush();

    viewer = await remountOverviewViewer(viewer, 5);
    expect(overview()).toBeNull();
    await openOverview({ boot: false });

    expect(camera()).toEqual(before);
  });

  it("opens another mockup's Overview fitted, whatever the camera of the last one (fails when the camera of one mockup carries over to another)", async () => {
    await mount(5, { query: HOME });
    await measure();
    const fitted = camera();
    await wheel({ deltaX: 300, deltaY: 200 });
    expect(camera()).not.toEqual(fitted);

    runtime.route.query = { name: "other" };
    viewer = await remountOverviewViewer(viewer, 5);
    await measure();

    expect(camera()).toEqual(fitted);
  });
});

describe("Escape on a page", () => {
  it("steps back from the Comment tool, Preview, the selection and an open menu before it goes back to the Overview (fails when Escape closes the page while one of them is on)", async () => {
    await mount(3);

    await press("c");
    expect(find("[data-dms-mockup-pin-capture]")).not.toBeNull();
    expect(await press("Escape")).toBe(true);
    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(overview()).toBeNull();

    await press("p");
    expect(await press("Escape")).toBe(true);
    expect(
      find("[data-dms-mockup-preview-toggle]")?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(overview()).toBeNull();

    await viewer.say({
      type: "layout",
      blocks: [
        { path: "block-0", rect: { x: 0, y: 40, width: 400, height: 100 } },
      ],
    });
    await viewer.say({ type: "select", path: "block-0" });
    expect(find("[data-dms-mockup-selection]")).not.toBeNull();
    expect(await press("Escape")).toBe(true);
    expect(find("[data-dms-mockup-selection]")).toBeNull();
    expect(overview()).toBeNull();

    const menu = document.createElement("div");
    menu.setAttribute("data-dismissable-layer", "");
    document.body.append(menu);
    expect(await press("Escape")).toBe(false);
    expect(overview()).toBeNull();
    menu.remove();

    expect(await press("Escape")).toBe(true);
    expect(overview()).not.toBeNull();
  });

  it("goes back to the Overview on an Escape the page itself handed over (fails when the page's Escape only ever leaves Preview)", async () => {
    await mount(3);

    await viewer.say({ type: "escape" });

    expect(overview()).not.toBeNull();
  });
});

describe("editing", () => {
  it("is off in the overview: no edit panel, inspector or block toolbar, undo off, and the editing keys write nothing (fails when a key edits the spec behind the overview)", async () => {
    await mount(1);
    await viewer.say({ type: "select", path: "block-0" });
    expect(find("[data-dms-mockup-edit-panel]")).not.toBeNull();
    expect(find("[data-dms-mockup-inspector]")).not.toBeNull();

    await openOverview();

    expect(find("[data-dms-mockup-edit-panel]")).toBeNull();
    expect(find("[data-dms-mockup-inspector]")).toBeNull();
    expect(
      find('[data-dms-mockup-panel-toggle="left"]')?.hasAttribute("disabled"),
    ).toBe(true);
    expect(find("[data-dms-mockup-undo]")?.hasAttribute("disabled")).toBe(true);
    for (const key of ["Delete", "Backspace"]) {
      expect(await press(key)).toBe(false);
    }
    expect(await press("d", { ctrlKey: true })).toBe(false);
    expect(await press("z", { ctrlKey: true })).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(writes()).toEqual([]);
  });
});

describe("a version previewed", () => {
  const VERSION = mockupState({ revision: 0, pages: overviewPages(2, "v") });

  async function previewVersion(): Promise<void> {
    runtime.authFetch.mockImplementation(async (url: string) => {
      if (url === HISTORY_URL) {
        return {
          versions: [2, 1].map((seq) => ({
            seq,
            by: "ai",
            comments: 0,
            summary: `Version ${seq}`,
            at: `2026-11-0${seq}T10:00:00.000Z`,
          })),
        };
      }
      if (url === `${HISTORY_URL}/1`) {
        return {
          seq: 1,
          by: "ai",
          comments: 0,
          summary: "Created",
          at: "2026-11-01T10:00:00.000Z",
          spec: {},
          state: VERSION,
          annotations: [],
        };
      }
      if (url.endsWith("/spec")) {
        return { spec: runtime.file.spec, digest: "d1" };
      }
      return { annotations: runtime.notes };
    });
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en-GB"),
      t: (key: string, params?: Record<string, number>) =>
        params ? `${key} ${Object.values(params).join(",")}` : key,
    }));
    await click("[data-dms-mockup-history]");
    await click('[data-dms-mockup-version="1"]');
  }

  it("lays out the version's pages, read-only: no Comment tool, and Escape leaves the version for the current one, on the Overview (fails when the overview shows the current pages or takes a pin)", async () => {
    await mount(4);
    await previewVersion();
    expect(find("[data-dms-mockup-version-banner]")).not.toBeNull();

    await openOverview();

    expect(frameIds()).toEqual(["v1", "v2"]);
    await press("c");
    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(await press("Escape")).toBe(true);
    expect(find("[data-dms-mockup-version-banner]")).toBeNull();
    expect(overview()).not.toBeNull();
    expect(frameIds()).toEqual(["p1", "p2", "p3", "p4"]);
  });
});
