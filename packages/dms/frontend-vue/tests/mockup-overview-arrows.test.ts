/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formPageIds,
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
      { id: "orders", links: ["order", "orders", "gone"], tree: [] },
      { id: "order", parent: "orders", links: ["orders"], tree: [] },
    ]);

    expect(ends(arrows)).toEqual(["link<>orders>order"]);
  });

  it("draws a link one way from the page that links, even when the other is its parent, and a parent alone dashed from the parent to its sub-page (fails when the direction follows the parent or the dash is lost)", () => {
    const arrows = overviewArrows(frames, [
      { id: "orders", tree: [] },
      { id: "order", parent: "orders", links: ["orders"], tree: [] },
    ]);
    const nested = overviewArrows(frames, [
      { id: "orders", tree: [] },
      { id: "order", parent: "orders", tree: [] },
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
        { id: "a", links: ["b", "c"], tree: [] },
        { id: "d", links: ["c"], tree: [] },
        { id: "c", links: ["d"], tree: [] },
      ],
    );

    expect(across?.path).toBe("M 580 800 C 580 1000 2420 1000 2420 800");
    expect(down?.path).toBe("M 580 800 C 580 1000 420 1000 420 1200");
    expect(both?.from).toBe("d");
  });

  it("reads the pages a table opens as its new, edit and details forms from its formContainer, wherever the table sits", () => {
    const table = (pages: Record<string, { urlSlug: string }>) => ({
      type: "TableView",
      options: { formContainer: { type: "page", pages } },
    });
    const forms = formPageIds([
      {
        tree: [
          { type: "Card", children: [table({ new: { urlSlug: "page:add" } })] },
          table({
            edit: { urlSlug: "page:change" },
            details: { urlSlug: "page:view" },
            ignored: { urlSlug: "page:other" },
          }),
          table({ new: { urlSlug: "elsewhere" } }),
          { type: "Form", options: { formContainer: { pages: { new: {} } } } },
        ],
      },
    ]);

    expect([...forms].sort()).toEqual(["add", "change", "view"]);
  });

  it("shows only the arrows of the page in focus, or every arrow while the toggle is on", () => {
    const arrows = overviewArrows(
      [
        { id: "a", rect: rect(0, 0) },
        { id: "b", rect: rect(2000, 0) },
        { id: "form", rect: rect(4000, 0) },
      ],
      [
        {
          id: "a",
          links: ["b", "form"],
          tree: [
            {
              type: "TableView",
              options: {
                formContainer: { pages: { new: { urlSlug: "page:form" } } },
              },
            },
          ],
        },
        { id: "b", links: ["form"], tree: [] },
      ],
    );
    const shown = (focus: string | undefined, all: boolean) =>
      shownArrows(arrows, focus, all).map(({ from, to }) => `${from}>${to}`);

    expect(shown(undefined, false)).toEqual([]);
    expect(shown("c", false)).toEqual([]);
    expect(shown("form", false)).toEqual(["a>form", "b>form"]);
    expect(shown("b", false)).toEqual(["a>b", "b>form"]);
    expect(shown(undefined, true)).toEqual(["a>b", "a>form", "b>form"]);
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
        `${path.getAttribute("data-kind")}:${path.getAttribute("data-dms-mockup-overview-arrow")}`,
    );
  const frame = (id: string) =>
    viewer?.host.querySelector<HTMLElement>(
      `[data-dms-mockup-overview-frame="${id}"]`,
    );

  it("draws no arrow at rest, the arrows of a page while it is hovered or picked, and every arrow while the links toggle is on (fails when an arrow shows at rest or never does)", async () => {
    expect(drawn()).toEqual([]);

    frame("order")?.dispatchEvent(new PointerEvent("pointerenter"));
    await flush();
    expect(drawn()).toEqual(["link:orders>order"]);

    frame("order")?.dispatchEvent(new PointerEvent("pointerleave"));
    frame("report")?.click();
    await flush();
    expect(drawn()).toEqual(["link:report>orders"]);

    viewer?.host
      .querySelector<HTMLElement>("[data-dms-mockup-overview-links]")
      ?.click();
    await flush();
    expect(drawn()).toEqual(["link:orders>order", "link:report>orders"]);
  });
});
