/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockupAnnotation } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  annotation,
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const ANNOTATIONS_URL = "/api/mockup/demo/annotations";
const FRAME_HEIGHT = 600;
const STATE = mockupState({
  pages: [
    mockupPage({
      paths: {
        "block-0": "/pages/0/tree/0",
        "block-0.kpi": "/pages/0/tree/0/children/0",
        "block-1": "/pages/0/tree/1",
      },
    }),
  ],
});
const LAYOUT = [
  { path: "block-0", rect: { x: 0, y: 40, width: 400, height: 100 } },
  { path: "block-0.kpi", rect: { x: 200, y: 40, width: 200, height: 100 } },
  { path: "block-1", rect: { x: 0, y: 200, width: 400, height: 100 } },
];

let runtime: MockupRuntime;
let viewer: MountedViewer;

async function mount(notes: MockupAnnotation[] = []): Promise<void> {
  runtime = stubMockupRuntime({ notes });
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
  await viewer.say({ type: "resize", height: FRAME_HEIGHT });
  await viewer.say({ type: "layout", blocks: LAYOUT });
}

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);
const writes = () =>
  runtime.authFetch.mock.calls.filter(([, init]) => init?.method);

/** A pointer event at a point of the screen; the frame is drawn unscaled at the screen's origin. */
function pointer(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

function press(key: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  return flush();
}

async function clickPage(x: number, y: number): Promise<void> {
  find("[data-dms-mockup-pin-capture]")?.dispatchEvent(pointer("click", x, y));
  await flush();
}

async function type(text: string, card = "draft"): Promise<void> {
  const field = viewer.host.querySelector<HTMLTextAreaElement>(
    `[data-dms-mockup-pin-card="${card}"] textarea`,
  );
  if (!field) throw new Error(`No card ${card} is open`);
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await flush();
}

async function click(selector: string): Promise<void> {
  find(selector)?.click();
  await flush();
}

/** Presses the pin `id`, moves the pointer to a point of the screen, and lets go there. */
async function drag(id: string, to: { x: number; y: number }): Promise<void> {
  find(`[data-dms-mockup-pin="${id}"]`)?.dispatchEvent(
    pointer("pointerdown", 1, 1),
  );
  window.dispatchEvent(pointer("pointermove", to.x, to.y));
  await flush();
  window.dispatchEvent(pointer("pointerup", to.x, to.y));
  await flush();
}

function spotOf(id: string) {
  const pin = find(`[data-dms-mockup-pin="${id}"]`);
  return pin && { left: pin.style.left, top: pin.style.top };
}

describe("dropping a pin", () => {
  beforeEach(() => mount());

  it("pins a note on the innermost block under the armed tool's click, at the click's offset in that block (fails when the note anchors on the outer block or loses the offset)", async () => {
    await press("c");
    await clickPage(250, 115);
    await type("Make it bolder");
    await click(
      '[data-dms-mockup-pin-card="draft"] [data-dms-mockup-pin-save]',
    );

    expect(writes()).toEqual([
      [
        ANNOTATIONS_URL,
        {
          method: "POST",
          body: {
            page: "orders",
            path: "/pages/0/tree/0/children/0",
            offset: { x: 0.25, y: 0.75 },
            text: "Make it bolder",
          },
        },
      ],
    ]);
    expect(find('[data-dms-mockup-pin-card="draft"]')).toBeNull();
  });

  it("pins a note on the page when the click is outside every block (fails when an outside click picks the nearest block)", async () => {
    await click("[data-dms-mockup-comment]");
    await clickPage(640, 450);
    await type("Add a footer");
    await click(
      '[data-dms-mockup-pin-card="draft"] [data-dms-mockup-pin-save]',
    );

    expect(writes()[0]?.[1]?.body).toEqual({
      page: "orders",
      offset: { x: 0.5, y: 0.75 },
      text: "Add a footer",
    });
  });

  it("pins a note on the page when the click lands on the page header or the top bar, which no block covers (fails when the header is refused as a place for a pin)", async () => {
    await press("c");
    await clickPage(640, 24);
    await type("Rename the title");
    await click(
      '[data-dms-mockup-pin-card="draft"] [data-dms-mockup-pin-save]',
    );

    expect(writes()[0]?.[1]?.body).toEqual({
      page: "orders",
      offset: { x: 0.5, y: 0.04 },
      text: "Rename the title",
    });
  });

  it("disarms after one drop, and Escape disarms before it clears the selection (fails when the tool stays armed or Escape drops the selection first)", async () => {
    await press("c");
    await clickPage(10, 10);
    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(find('[data-dms-mockup-pin-card="draft"]')).not.toBeNull();

    await click(
      '[data-dms-mockup-pin-card="draft"] [data-dms-mockup-pin-close]',
    );
    await viewer.say({ type: "select", path: "block-0" });
    await press("c");
    await press("Escape");

    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(find("[data-dms-mockup-selection]")).not.toBeNull();
    expect(writes()).toEqual([]);
  });
});

describe("the armed Comment tool", () => {
  const NOTE = annotation({ id: "a1", offset: { x: 0.5, y: 0.5 } });

  beforeEach(() => mount([NOTE]));

  const hover = async (x: number, y: number) => {
    find("[data-dms-mockup-pin-capture]")?.dispatchEvent(
      pointer("pointermove", x, y),
    );
    await flush();
  };
  const targets = () =>
    [
      ...viewer.host.querySelectorAll<HTMLElement>(
        "[data-dms-mockup-pin-target]",
      ),
    ].map((target) => ({
      kind: target.dataset.dmsMockupPinTarget,
      left: target.style.left,
      top: target.style.top,
      width: target.style.width,
      height: target.style.height,
    }));

  it("shows the comment cursor while armed and the normal one once Escape disarms it (fails when the cursor outlives the tool)", async () => {
    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    await press("c");
    expect(find("[data-dms-mockup-pin-capture]")?.classList).toContain(
      "dms-pin-cursor",
    );
    await press("Escape");
    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(find(".dms-pin-cursor")).toBeNull();
  });

  it("outlines the innermost block under the pointer, and the whole page outside every block (fails when the outline picks the outer block or no page)", async () => {
    await press("c");
    expect(targets()).toEqual([]);
    await hover(250, 115);
    expect(targets()).toEqual([
      {
        kind: "block",
        left: "200px",
        top: "40px",
        width: "200px",
        height: "100px",
      },
    ]);
    await hover(640, 450);
    expect(targets()).toEqual([
      { kind: "page", left: "", top: "", width: "", height: "" },
    ]);
  });

  it("outlines the same box for a pin being dragged, once, and drops it with the pin (fails when the drag draws a second outline or keeps it)", async () => {
    find('[data-dms-mockup-pin="a1"]')?.dispatchEvent(
      pointer("pointerdown", 1, 1),
    );
    window.dispatchEvent(pointer("pointermove", 100, 275));
    await flush();
    expect(targets()).toEqual([
      {
        kind: "block",
        left: "0px",
        top: "200px",
        width: "400px",
        height: "100px",
      },
    ]);
    window.dispatchEvent(pointer("pointerup", 100, 275));
    await flush();
    expect(targets()).toEqual([]);
  });
});

describe("where pins show", () => {
  const ON_BLOCK = annotation({ id: "on-block", offset: { x: 0.5, y: 0.5 } });
  const ON_PAGE = annotation({
    id: "on-page",
    anchor: { page: "orders" },
    path: undefined,
    offset: { x: 0.5, y: 0.25 },
  });

  beforeEach(() => mount([ON_BLOCK, ON_PAGE]));

  it("draws a note at its offset of its block's box, and follows the block when the layout moves (fails when a pin keeps the point it was dropped at)", async () => {
    expect(spotOf("on-block")).toEqual({ left: "200px", top: "90px" });

    await viewer.say({
      type: "layout",
      blocks: [
        { path: "block-0", rect: { x: 0, y: 240, width: 400, height: 100 } },
      ],
    });

    expect(spotOf("on-block")).toEqual({ left: "200px", top: "290px" });
  });

  it("draws a page note at the same fractions of the page on desktop and on mobile (fails when the offset is read as pixels)", async () => {
    expect(spotOf("on-page")).toEqual({ left: "640px", top: "150px" });

    const [, mobile] = viewer.host.querySelectorAll<HTMLElement>(
      "[data-dms-mockup-width]",
    );
    mobile.click();
    await flush();

    expect(spotOf("on-page")).toEqual({ left: "195px", top: "150px" });
  });

  it("draws open notes only, and the top bar has no toggle for the resolved ones (fails when a resolved pin stays on the page or the toggle is back)", async () => {
    await viewer.publish("annotations", {
      annotations: [{ ...ON_BLOCK, status: "resolved" }, ON_PAGE],
    });

    expect(spotOf("on-block")).toBeNull();
    expect(spotOf("on-page")).not.toBeNull();
    expect(find("[data-dms-mockup-show-resolved]")).toBeNull();
  });

  it("ignores an annotations event whose pins have no offset or an anchor page that is no string (fails when the guard lets a wrong pin through)", async () => {
    const { offset: _offset, ...unplaced } = ON_BLOCK;
    await viewer.publish("annotations", { annotations: [unplaced] });
    await viewer.publish("annotations", {
      annotations: [{ ...ON_PAGE, anchor: { page: 3 } }],
    });

    expect(spotOf("on-block")).not.toBeNull();
    expect(spotOf("on-page")).not.toBeNull();
  });
});

describe("moving a pin", () => {
  const NOTE = annotation({ id: "a1", offset: { x: 0.5, y: 0.5 } });

  beforeEach(() => mount([NOTE]));

  it("re-anchors a pin dragged onto another block, at the drop's offset (fails when a drag only opens the card)", async () => {
    await drag("a1", { x: 100, y: 275 });

    expect(writes()).toEqual([
      [
        `${ANNOTATIONS_URL}/a1`,
        {
          method: "PATCH",
          body: {
            place: {
              page: "orders",
              path: "/pages/0/tree/1",
              offset: { x: 0.25, y: 0.75 },
            },
          },
        },
      ],
    ]);
    expect(find('[data-dms-mockup-pin-card="a1"]')).toBeNull();
  });

  it("makes a pin dragged off every block a note on the page (fails when it keeps its block)", async () => {
    await drag("a1", { x: 640, y: 450 });

    expect(writes()[0]?.[1]?.body).toEqual({
      place: { page: "orders", offset: { x: 0.5, y: 0.75 } },
    });
  });

  it("leaves a pin where it was when it is dropped off the page (fails when it lands on the nearest edge)", async () => {
    await drag("a1", { x: 2000, y: 50 });

    expect(writes()).toEqual([]);
    expect(spotOf("a1")).toEqual({ left: "200px", top: "90px" });
  });
});

describe("a pin's card", () => {
  const NOTE = annotation({ id: "a1", text: "Too tight" });

  beforeEach(() => mount([NOTE]));

  async function open(): Promise<void> {
    find('[data-dms-mockup-pin="a1"]')?.dispatchEvent(
      pointer("pointerdown", 5, 5),
    );
    window.dispatchEvent(pointer("pointerup", 5, 5));
    await flush();
  }

  it("opens on a click, and edits the note's text with a PATCH (fails when the click starts a drag)", async () => {
    await open();
    await type("Much too tight", "a1");
    await click('[data-dms-mockup-pin-card="a1"] [data-dms-mockup-pin-save]');

    expect(writes()).toEqual([
      [
        `${ANNOTATIONS_URL}/a1`,
        { method: "PATCH", body: { text: "Much too tight" } },
      ],
    ]);
  });

  it("resolves the note, and its pin leaves the page with its card (fails when the status is not sent or a resolved pin stays)", async () => {
    await open();
    await click('[data-dms-mockup-pin-card="a1"] [data-dms-mockup-pin-status]');

    expect(writes()).toEqual([
      [
        `${ANNOTATIONS_URL}/a1`,
        { method: "PATCH", body: { status: "resolved" } },
      ],
    ]);
    expect(find('[data-dms-mockup-pin="a1"]')).toBeNull();
    expect(find('[data-dms-mockup-pin-card="a1"]')).toBeNull();
  });

  it("deletes the note for good with DELETE, and its pin goes (fails when delete only resolves)", async () => {
    await open();
    await click('[data-dms-mockup-pin-card="a1"] [data-dms-mockup-pin-delete]');

    expect(writes()).toEqual([[`${ANNOTATIONS_URL}/a1`, { method: "DELETE" }]]);
    expect(spotOf("a1")).toBeNull();
  });
});

describe("pressing elsewhere while a card is open", () => {
  const FIRST = annotation({ id: "a1", text: "Too tight" });
  const SECOND = annotation({
    id: "a2",
    text: "Bigger title",
    path: "/pages/0/tree/1",
    anchor: { block: "b-chart", steps: [] },
  });

  beforeEach(() => mount([FIRST, SECOND]));

  const card = (id = "a1") => find(`[data-dms-mockup-pin-card="${id}"]`);
  const field = (id = "a1") =>
    viewer.host.querySelector<HTMLTextAreaElement>(
      `[data-dms-mockup-pin-card="${id}"] textarea`,
    );

  async function clickPin(id: string): Promise<void> {
    find(`[data-dms-mockup-pin="${id}"]`)?.dispatchEvent(
      pointer("pointerdown", 5, 5),
    );
    window.dispatchEvent(pointer("pointerup", 5, 5));
    await flush();
  }

  async function pressOn(target: Element | null, button = 0): Promise<void> {
    target?.dispatchEvent(
      new MouseEvent("pointerdown", { button, bubbles: true }),
    );
    await flush();
  }

  const elsewhere = () => find("[data-dms-mockup-canvas]");

  it("closes a note's card on a press anywhere else in the viewer (fails when only Close or Escape closes it)", async () => {
    await clickPin("a1");
    expect(card()).not.toBeNull();

    await pressOn(elsewhere());

    expect(card()).toBeNull();
  });

  it("keeps the card open on a press inside it, and lets its own pin close it in one click (fails when a press in the card or on its pin reopens or keeps it)", async () => {
    await clickPin("a1");
    await pressOn(field());
    expect(card()).not.toBeNull();

    await clickPin("a1");

    expect(card()).toBeNull();
  });

  it("leaves the card open on a press of another button than the main one, which pans the Overview (fails when a middle-button press closes it)", async () => {
    await clickPin("a1");

    await pressOn(elsewhere(), 1);

    expect(card()).not.toBeNull();
  });

  it("switches to another pin's card in one click (fails when the first click on the other pin only closes the open card)", async () => {
    await clickPin("a1");

    await clickPin("a2");

    expect(card("a1")).toBeNull();
    expect(card("a2")).not.toBeNull();
  });

  it("closes the card on a press in the preview, which the preview reports (fails when a press in the preview leaves the card open)", async () => {
    await clickPin("a1");

    await viewer.say({ type: "press", button: 0 });

    expect(card()).toBeNull();
  });

  it("opens a note's card again on what was written and not saved, and Close lets that text go (fails when a press elsewhere loses the text or Close keeps it)", async () => {
    await clickPin("a1");
    await type("Much too tight", "a1");
    await pressOn(elsewhere());

    await clickPin("a1");
    expect(field()?.value).toBe("Much too tight");

    await click('[data-dms-mockup-pin-card="a1"] [data-dms-mockup-pin-close]');
    await clickPin("a1");
    expect(field()?.value).toBe("Too tight");
    expect(writes()).toEqual([]);
  });

  it("drops a new pin left empty on a press elsewhere, and keeps one with text open, shaking (fails when a stray press throws written text away)", async () => {
    await press("c");
    await clickPage(250, 115);
    await pressOn(elsewhere());
    expect(card("draft")).toBeNull();

    await press("c");
    await clickPage(250, 115);
    await type("Make it bolder");
    await pressOn(elsewhere());

    expect(field("draft")?.value).toBe("Make it bolder");
    expect(card("draft")?.dataset.shaking).toBe("true");
    expect(writes()).toEqual([]);
  });
});

describe("comments without a block", () => {
  const ORPHAN = annotation({
    id: "orphan",
    text: "Was on the old chart",
    page: undefined,
    path: undefined,
  });

  beforeEach(() => mount([ORPHAN]));

  it("waits in the corner tray, and a drag onto a block pins it there (fails when an orphan cannot be re-anchored)", async () => {
    const tray = find("[data-dms-mockup-pin-tray]");
    expect(tray?.textContent).toContain("Was on the old chart");

    await drag("orphan", { x: 300, y: 90 });

    expect(writes()[0]?.[1]?.body).toEqual({
      place: {
        page: "orders",
        path: "/pages/0/tree/0/children/0",
        offset: { x: 0.5, y: 0.5 },
      },
    });
    expect(find("[data-dms-mockup-pin-tray]")).toBeNull();
  });
});
