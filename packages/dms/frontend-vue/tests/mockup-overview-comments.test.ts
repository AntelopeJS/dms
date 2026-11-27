// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockupAnnotation } from "../layers/dms-ui/app/entries/utils/mockup";
import { MOCKUP_ASSISTANT_PROMPT_EVENT } from "../layers/dms-ui/app/utils/mockupAssistant";
import {
  annotation,
  flush,
  rendered,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";
import { mountOverviewViewer, overviewDriver } from "./helpers/mockup-overview";

const ANNOTATIONS_URL = "/api/mockup/demo/annotations";

let runtime: MockupRuntime;
let viewer: MountedViewer;

const {
  find,
  findAll,
  live,
  press,
  openOverview,
  frameRect,
  onScreen,
  pointer,
  spyOn,
  sayFrom,
  bootLive,
  click,
  wheel,
} = overviewDriver(() => viewer);

async function mount(
  count: number,
  options: { notes?: MockupAnnotation[] } = {},
): Promise<void> {
  ({ viewer, runtime } = await mountOverviewViewer(count, options.notes));
}

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

const writes = () =>
  runtime.authFetch.mock.calls.filter(([, init]) => init?.method);

describe("the frames drawn live", () => {
  it("draws at most ten frames live, nearest the middle first, and the others as placeholders (fails when every page of a large mockup loads an iframe)", async () => {
    await mount(12);
    await openOverview();

    expect(findAll("[data-dms-mockup-overview-preview]")).toHaveLength(10);
    const placeholders = findAll("[data-dms-mockup-overview-placeholder]").map(
      (placeholder) =>
        placeholder
          .closest("[data-dms-mockup-overview-frame]")
          ?.getAttribute("data-dms-mockup-overview-frame"),
    );
    expect(placeholders).toHaveLength(2);
    for (const corner of placeholders) {
      expect(["p1", "p6", "p7", "p12"]).toContain(corner);
    }
  });

  it("draws every page of a 12-page Overview once, the two past the cap as a snapshot of the blocks they reported (fails when those pages show only the page icon)", async () => {
    await mount(12);
    await openOverview();
    const block = {
      path: "block-0",
      rect: { x: 0, y: 0, width: 400, height: 90 },
    };
    for (let round = 0; round < 3; round += 1) {
      for (const frame of findAll("[data-dms-mockup-overview-slot]")) {
        const page = frame.getAttribute("data-dms-mockup-overview-slot");
        if (page) await sayFrom(page, { type: "layout", blocks: [block] });
      }
      await bootLive();
    }

    const undrawn = findAll("[data-dms-mockup-overview-frame]").filter(
      (frame) =>
        frame.querySelector("[data-dms-mockup-overview-slot]") === null &&
        !live(frame.getAttribute("data-dms-mockup-overview-frame") ?? "") &&
        frame.querySelector("[data-dms-mockup-overview-snapshot-block]") ===
          null,
    );
    expect(findAll("[data-dms-mockup-overview-frame]")).toHaveLength(12);
    expect(undrawn).toHaveLength(0);
    expect(findAll("[data-dms-mockup-overview-preview]")).toHaveLength(10);
  });

  it("draws each live frame on a compositing layer of its own, which a pan or a zoom only moves (fails when the class goes and every move of the canvas sorts every live page into layers again)", async () => {
    await mount(3);
    await openOverview();

    const previews = findAll("[data-dms-mockup-overview-preview]");
    expect(previews).toHaveLength(3);
    for (const preview of previews) {
      expect(preview.classList).toContain("will-change-transform");
    }
  });

  it("keeps the live frames as they are while the canvas moves, and hands them to the pages nearest the middle once it rests (fails when a pan redraws an iframe mid-gesture)", async () => {
    await mount(12);
    await openOverview();
    const placeholders = () =>
      findAll("[data-dms-mockup-overview-placeholder]")
        .map((placeholder) =>
          placeholder
            .closest("[data-dms-mockup-overview-frame]")
            ?.getAttribute("data-dms-mockup-overview-frame"),
        )
        .sort((left, right) => String(left).localeCompare(String(right)));
    const rest = async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await flush();
    };

    await wheel({ deltaX: -460 });
    await rest();
    expect(placeholders()).toEqual(["p12", "p6"]);

    await wheel({ deltaX: 920 });
    expect(placeholders()).toEqual(["p12", "p6"]);
    await rest();
    expect(placeholders()).toEqual(["p1", "p7"]);
  });

  it("boots one iframe at a time, the page nearest the middle first, the next once it said ready (fails when every iframe boots at once and blocks the window)", async () => {
    await mount(5);
    await openOverview({ boot: false });

    const preview = "[data-dms-mockup-overview-preview]";
    expect(findAll(preview)).toHaveLength(1);
    expect(live("p3")).not.toBeNull();
    await sayFrom("p3", { type: "ready" });
    expect(findAll(preview)).toHaveLength(2);
    await sayFrom("p3", { type: "ready" });
    expect(findAll(preview)).toHaveLength(2);
  });

  it("asks each live frame to draw its own page on the fixtures, at least a window tall, with the sidebar on that page (fails when a frame draws the page in view)", async () => {
    await mount(3);
    await openOverview();
    const posted = spyOn("p2");

    await sayFrom("p2", { type: "ready" });

    const [render] = rendered(posted);
    const [block] = Array.isArray(render?.tree) ? render.tree : [render?.tree];
    expect(block?.options?.title).toBe("KPI 2");
    expect(render?.navigation?.active).toBe("p2");
    expect(render?.header?.title).toBe("Page 2");
    expect(posted).toContainEqual(
      expect.objectContaining({ type: "min-height", height: 800 }),
    );
    expect(live("p2")?.querySelector("iframe")?.getAttribute("src")).toContain(
      "fixtures",
    );
  });

  it("draws each frame as tall as its page reported (fails when a long page is cut at the least height)", async () => {
    await mount(3);
    await openOverview();

    await sayFrom("p3", { type: "resize", height: 2100 });

    expect(frameRect("p3").height).toBe(2100);
    expect(frameRect("p1").height).toBe(800);
  });
});

const LAYOUT = [
  { path: "block-0", rect: { x: 0, y: 100, width: 400, height: 200 } },
];

async function drawLive(page: string): Promise<void> {
  await sayFrom(page, { type: "ready" });
  await sayFrom(page, { type: "layout", blocks: LAYOUT });
}

describe("comments in the overview", () => {
  async function placeOn(page: string, point: { x: number; y: number }) {
    live(page)
      ?.querySelector("[data-dms-mockup-pin-capture]")
      ?.dispatchEvent(pointer("click", onScreen(page, point)));
    await flush();
  }

  async function write(text: string): Promise<void> {
    const field = viewer.host.querySelector(
      '[data-dms-mockup-pin-card="draft"] textarea',
    );
    if (!(field instanceof HTMLTextAreaElement)) {
      throw new TypeError("No pin is being written");
    }
    field.value = text;
    field.dispatchEvent(new Event("input"));
    await flush();
    await click(
      '[data-dms-mockup-pin-card="draft"] [data-dms-mockup-pin-save]',
    );
  }

  it("places a pin on any frame, on the block under the click of that page, at the click's offset (fails when the pin lands on the page in view or the offset is read on the canvas)", async () => {
    await mount(5);
    await openOverview();
    await drawLive("p3");

    await press("c");
    await placeOn("p3", { x: 100, y: 150 });
    await write("Bigger numbers");

    expect(writes().map(([url]) => String(url))).toEqual([ANNOTATIONS_URL]);
    const [note] = runtime.notes;
    expect(note).toMatchObject({
      page: "p3",
      path: "/pages/2/tree/0",
      text: "Bigger numbers",
    });
    expect(note?.offset.x).toBeCloseTo(0.25);
    expect(note?.offset.y).toBeCloseTo(0.25);
  });

  it("pins a note on the page itself when the click is off every block of that frame", async () => {
    await mount(5);
    await openOverview();
    await drawLive("p2");

    await click("[data-dms-mockup-comment]");
    await placeOn("p2", { x: 640, y: 600 });
    await write("Add a footer");

    const [note] = runtime.notes;
    expect(note).toMatchObject({ page: "p2", text: "Add a footer" });
    expect(note?.path).toBeUndefined();
    expect(note?.offset.x).toBeCloseTo(0.5);
    expect(note?.offset.y).toBeCloseTo(0.75);
  });

  it("draws each page's open pins on its frame and counts its open comments above it (fails when a pin shows on the wrong frame or a resolved one is counted)", async () => {
    await mount(4, {
      notes: [
        annotation({ id: "a1", page: "p2", path: "/pages/1/tree/0" }),
        annotation({ id: "a2", page: "p2", path: undefined }),
        annotation({ id: "a3", page: "p2", status: "resolved" }),
        annotation({ id: "a4", page: "p4", path: undefined }),
      ],
    });
    await viewer.publish("annotations", { annotations: runtime.notes });
    await openOverview();
    await drawLive("p2");

    const count = (page: string) =>
      find(`[data-dms-mockup-overview-count="${page}"]`)?.textContent?.trim();
    expect(count("p2")).toBe("2");
    expect(count("p4")).toBe("1");
    expect(count("p1")).toBeUndefined();
    expect(
      live("p2")?.querySelector('[data-dms-mockup-pin="a1"]'),
    ).not.toBeNull();
    expect(live("p2")?.querySelector('[data-dms-mockup-pin="a3"]')).toBeNull();
    expect(
      live("p4")?.querySelector('[data-dms-mockup-pin="a4"]'),
    ).not.toBeNull();
  });

  it("hands every open comment to the assistant with no page in view (fails when the overview names the page last opened)", async () => {
    const received: unknown[] = [];
    const listen = (event: Event) => {
      if (event instanceof CustomEvent) received.push(event.detail);
    };
    window.addEventListener(MOCKUP_ASSISTANT_PROMPT_EVENT, listen);
    await mount(3, { notes: [annotation({ page: "p1" })] });
    await viewer.publish("annotations", { annotations: runtime.notes });
    await openOverview();

    await click("[data-dms-mockup-resolve]");
    window.removeEventListener(MOCKUP_ASSISTANT_PROMPT_EVENT, listen);

    expect(received).toEqual([{ prompt: "demo", source: "resolve-comments" }]);
  });
});

describe("an open card in the overview", () => {
  const NOTES = [
    annotation({ id: "a1", page: "p2", path: undefined }),
    annotation({ id: "a2", page: "p3", path: undefined }),
  ];
  const card = (id: string) => find(`[data-dms-mockup-pin-card="${id}"]`);

  async function clickPin(id: string): Promise<void> {
    const pin = find(`[data-dms-mockup-pin="${id}"]`);
    const at = { x: 1, y: 1 };
    pin?.dispatchEvent(pointer("pointerdown", at));
    window.dispatchEvent(pointer("pointerup", at));
    await flush();
  }

  async function openWithNotes(): Promise<void> {
    await mount(4, { notes: NOTES });
    await viewer.publish("annotations", { annotations: runtime.notes });
    await openOverview();
    await drawLive("p2");
    await drawLive("p3");
    await clickPin("a1");
    expect(card("a1")).not.toBeNull();
  }

  it("closes on a press on a frame or the canvas, and a press on a pin of another page opens that pin's card (fails when the Overview needs Escape or Close)", async () => {
    await openWithNotes();

    find('[data-dms-mockup-overview-frame="p4"]')?.dispatchEvent(
      pointer("pointerdown", { x: 5, y: 5 }),
    );
    await flush();
    expect(card("a1")).toBeNull();

    await clickPin("a1");
    await clickPin("a2");
    expect(card("a1")).toBeNull();
    expect(card("a2")).not.toBeNull();
  });

  it("stays open through a pan with Space and a drag, as through one with the wheel or the middle button (fails when panning to look around closes it)", async () => {
    await openWithNotes();

    await press(" ", { code: "Space" });
    const grab = find("[data-dms-mockup-overview-pan]");
    grab?.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    grab?.dispatchEvent(pointer("pointermove", { x: 150, y: 130 }));
    grab?.dispatchEvent(pointer("pointerup", { x: 150, y: 130 }));
    window.dispatchEvent(
      new KeyboardEvent("keyup", { key: " ", code: "Space" }),
    );
    await flush();
    expect(card("a1")).not.toBeNull();

    find("[data-dms-mockup-overview]")?.dispatchEvent(
      pointer("pointerdown", { x: 0, y: 0 }, { button: 1 }),
    );
    await flush();
    expect(card("a1")).not.toBeNull();
  });
});

describe("a press inside a card in the overview", () => {
  const inFrame = (page: string, selector: string) =>
    live(page)?.querySelector<HTMLElement>(selector) ?? null;

  async function pressInside(page: string, card: string): Promise<void> {
    inFrame(
      page,
      `[data-dms-mockup-pin-card="${card}"] textarea`,
    )?.dispatchEvent(pointer("pointerdown", { x: 1, y: 1 }));
    await flush();
  }

  it("keeps a new pin's card open on a press in its field, on the page the page view has open (fails when the hidden page view's copy of the card takes the press for one outside)", async () => {
    await mount(3);
    await openOverview();
    await drawLive("p1");
    await press("c");
    live("p1")
      ?.querySelector("[data-dms-mockup-pin-capture]")
      ?.dispatchEvent(pointer("click", onScreen("p1", { x: 100, y: 150 })));
    await flush();
    expect(inFrame("p1", '[data-dms-mockup-pin-card="draft"]')).not.toBeNull();

    await pressInside("p1", "draft");

    expect(inFrame("p1", '[data-dms-mockup-pin-card="draft"]')).not.toBeNull();
  });

  it("keeps a note's card open on a press in its field, on the page the page view has open (fails when the hidden page view's copy of the card closes it)", async () => {
    await mount(3, {
      notes: [annotation({ id: "a1", page: "p1", path: undefined })],
    });
    await viewer.publish("annotations", { annotations: runtime.notes });
    await openOverview();
    await drawLive("p1");
    inFrame("p1", '[data-dms-mockup-pin="a1"]')?.dispatchEvent(
      pointer("pointerdown", { x: 1, y: 1 }),
    );
    window.dispatchEvent(pointer("pointerup", { x: 1, y: 1 }));
    await flush();
    expect(inFrame("p1", '[data-dms-mockup-pin-card="a1"]')).not.toBeNull();

    await pressInside("p1", "a1");

    expect(inFrame("p1", '[data-dms-mockup-pin-card="a1"]')).not.toBeNull();
  });
});
