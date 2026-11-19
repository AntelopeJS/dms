/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  overviewArrows,
  shownArrows,
} from "../layers/dms-ui/app/entries/utils/mockupOverviewArrows";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const rect = (x: number, y: number) => ({ x, y, width: 1000, height: 800 });

describe("Overview arrows", () => {
  const frames = [
    { id: "orders", rect: rect(0, 0) },
    { id: "order", rect: rect(2000, 0) },
  ];
  const ends = (arrows: ReturnType<typeof overviewArrows>) =>
    arrows.map(
      ({ from, to, kind, isTwoWay }) =>
        `${kind}${isTwoWay ? "<>" : ":"}${from}>${to}`,
    );

  it("draws one arrow for a pair of pages, solid with a head at each end when they link both ways, though the sub-page is also under its parent (fails when a pair draws an arrow per link and per parent)", () => {
    const arrows = overviewArrows(frames, [
      { id: "orders", links: ["order", "orders", "gone"] },
      { id: "order", parent: "orders", links: ["orders"] },
    ]);

    expect(ends(arrows)).toEqual(["link<>orders>order"]);
  });

  it("draws a link one way from the page that links, even when the other is its parent, and a parent alone dashed from the parent to its sub-page (fails when the direction follows the parent or the dash is lost)", () => {
    const arrows = overviewArrows(frames, [
      { id: "orders" },
      { id: "order", parent: "orders", links: ["orders"] },
    ]);
    const nested = overviewArrows(frames, [
      { id: "orders" },
      { id: "order", parent: "orders" },
    ]);

    expect(ends(arrows)).toEqual(["link:order>orders"]);
    expect(ends(nested)).toEqual(["parent:orders>order"]);
  });

  it("arcs below a row between frames of one row, clear of the titles above it, and leaves a frame by the edge facing the frame below, a two-way arrow along the path of its first page", () => {
    const [across, down, both] = overviewArrows(
      [
        { id: "a", rect: rect(0, 0) },
        { id: "b", rect: rect(2000, 0) },
        { id: "c", rect: rect(0, 1200) },
        { id: "d", rect: rect(2000, 1200) },
      ],
      [
        { id: "a", links: ["b", "c"] },
        { id: "d", links: ["c"] },
        { id: "c", links: ["d"] },
      ],
    );

    expect(across?.path).toBe("M 580 800 C 580 1000 2420 1000 2420 800");
    expect(down?.path).toBe("M 580 800 C 580 1000 420 1000 420 1200");
    expect(both?.from).toBe("d");
  });

  it("keeps every arrow, plain at rest, and the arrows of the page in focus focused and drawn last while the others dim (fails when an arrow is hidden or a focus emphasises the wrong arrows)", () => {
    const arrows = overviewArrows(
      [
        { id: "a", rect: rect(0, 0) },
        { id: "b", rect: rect(2000, 0) },
        { id: "form", rect: rect(4000, 0) },
      ],
      [
        { id: "a", links: ["b", "form"] },
        { id: "b", links: ["form"] },
      ],
    );
    const shown = (focus: string | undefined) =>
      shownArrows(arrows, focus).map(
        ({ from, to, emphasis }) => `${emphasis}:${from}>${to}`,
      );

    expect(shown(undefined)).toEqual([
      "plain:a>b",
      "plain:a>form",
      "plain:b>form",
    ]);
    expect(shown("c")).toEqual([
      "dimmed:a>b",
      "dimmed:a>form",
      "dimmed:b>form",
    ]);
    expect(shown("form")).toEqual([
      "dimmed:a>b",
      "focused:a>form",
      "focused:b>form",
    ]);
    expect(shown("b")).toEqual([
      "dimmed:a>form",
      "focused:a>b",
      "focused:b>form",
    ]);
  });
});

describe("Overview arrows in the viewer", () => {
  let viewer: MountedViewer | undefined;

  beforeEach(async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish(
      "state",
      mockupState({
        pages: [
          mockupPage({
            id: "orders",
            title: "Orders",
            links: ["order"],
            tree: [
              {
                type: "TableView",
                options: {
                  formContainer: {
                    type: "page",
                    pages: { details: { urlSlug: "page:order" } },
                  },
                },
              },
            ],
          }),
          mockupPage({
            id: "report",
            title: "Report",
            links: ["orders"],
            paths: {},
          }),
          mockupPage({
            id: "order",
            title: "Order",
            menu: false,
            parent: "orders",
            paths: {},
          }),
        ],
      }),
    );
    viewer.host
      .querySelector<HTMLElement>("[data-dms-mockup-close-page]")
      ?.click();
    await flush();
  });

  afterEach(() => {
    viewer?.unmount();
    viewer = undefined;
    vi.unstubAllGlobals();
  });

  const drawn = () =>
    [
      ...(viewer?.host.querySelectorAll("[data-dms-mockup-overview-arrow]") ??
        []),
    ].map(
      (path) =>
        `${path.getAttribute("data-emphasis")}:${path.getAttribute("data-kind")}:${path.getAttribute("data-dms-mockup-overview-arrow")}`,
    );
  const frame = (id: string) =>
    viewer?.host.querySelector<HTMLElement>(
      `[data-dms-mockup-overview-frame="${id}"]`,
    );

  it("draws every arrow at rest, and brings out a hovered or picked page's arrows while the others dim (fails when an arrow is hidden at rest or a focus hides one)", async () => {
    expect(drawn()).toEqual([
      "plain:link:orders>order",
      "plain:link:report>orders",
    ]);
    expect(
      viewer?.host.querySelector("[data-dms-mockup-overview-links]"),
    ).toBeNull();

    frame("order")?.dispatchEvent(new PointerEvent("pointerenter"));
    await flush();
    expect(drawn()).toEqual([
      "dimmed:link:report>orders",
      "focused:link:orders>order",
    ]);

    frame("order")?.dispatchEvent(new PointerEvent("pointerleave"));
    frame("report")?.click();
    await flush();
    expect(drawn()).toEqual([
      "dimmed:link:orders>order",
      "focused:link:report>orders",
    ]);
  });
});
