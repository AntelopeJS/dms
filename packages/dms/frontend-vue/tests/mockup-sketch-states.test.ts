// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewNode } from "../layers/dms-ui/app/entries/utils/blockPreview";
import type { MockupState } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  parseMockupSpec,
  type MockupSpecPage,
} from "../layers/dms-ui/app/entries/utils/mockupSpec";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  rendered,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const STATES = { empty: "<p>No orders yet</p>", error: "<p>Failed</p>" };
const SKETCH = {
  type: "sketch",
  options: { html: "<p>3 orders</p>", states: STATES },
};
const STATE = mockupState({
  pages: [
    mockupPage({
      tree: [{ ...SKETCH, options: { ...SKETCH.options, height: 160 } }],
      paths: { "block-0": "/pages/0/tree/0" },
    }),
  ],
});

const BOARD_STATE = mockupState({
  pages: [
    mockupPage({
      custom: true,
      tree: [{ ...SKETCH, options: { ...SKETCH.options, height: 800 } }],
      paths: {},
    }),
  ],
});

let runtime: MockupRuntime;
let viewer: MountedViewer;

async function mount(page: MockupSpecPage, state: MockupState): Promise<void> {
  runtime = stubMockupRuntime({ spec: { version: 1, pages: [page] } });
  viewer = await mountViewer();
  await viewer.publish("state", state);
  await viewer.say({ type: "ready" });
  await viewer.say({ type: "resize", height: 600 });
  await viewer.say({
    type: "layout",
    blocks: [
      { path: "block-0", rect: { x: 0, y: 0, width: 400, height: 160 } },
    ],
  });
}

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);

function drawnTree(): PreviewNode[] {
  return [rendered(viewer.posted).at(-1)?.tree ?? []].flat();
}

async function pick(state: string): Promise<void> {
  find(`[data-dms-mockup-sketch-state="${state}"]`)?.click();
  await flush();
}

async function comment(x: number, y: number, text: string): Promise<void> {
  find("[data-dms-mockup-comment]")?.click();
  await flush();
  find("[data-dms-mockup-pin-capture]")?.dispatchEvent(
    new MouseEvent("click", { clientX: x, clientY: y, bubbles: true }),
  );
  await flush();
  const field = find('[data-dms-mockup-pin-card="draft"] textarea');
  if (!(field instanceof HTMLTextAreaElement)) throw new Error("no draft");
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await flush();
  find(
    '[data-dms-mockup-pin-card="draft"] [data-dms-mockup-pin-save]',
  )?.click();
  await flush();
}

const posted = () =>
  runtime.authFetch.mock.calls.filter(
    ([, request]) => request?.method === "POST",
  );

describe("named states of a sketch", () => {
  beforeEach(async () => {
    await mount({ id: "orders", title: "Orders", tree: [SKETCH] }, STATE);
    await viewer.say({ type: "select", path: "block-0" });
  });

  it("offers the selected sketch's states, and draws the one picked in place of its html, back to the default on Default (fails when the pick never reaches the preview)", async () => {
    const offered = [
      ...viewer.host.querySelectorAll("[data-dms-mockup-sketch-state]"),
    ].map((button) => button.getAttribute("data-dms-mockup-sketch-state"));

    await pick("empty");
    const empty = drawnTree()[0]?.options?.html;
    await pick("");

    expect(offered).toEqual(["", "empty", "error"]);
    expect(empty).toBe(STATES.empty);
    expect(drawnTree()[0]?.options?.html).toBe("<p>3 orders</p>");
    expect(runtime.file.version).toBe(1);
  });

  it("pins a comment on the sketch with the state drawn, and its card says which (fails when the state is dropped)", async () => {
    await pick("error");
    await comment(200, 80, "Say what failed");
    const posts = posted();
    find(`[data-dms-mockup-pin="${runtime.notes[0]?.id}"]`)?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    await flush();

    expect(posts[0]?.[1]?.body).toMatchObject({
      page: "orders",
      path: "/pages/0/tree/0",
      state: "error",
    });
    expect(
      find("[data-dms-mockup-pin-sketch-state]")?.getAttribute(
        "data-dms-mockup-pin-sketch-state",
      ),
    ).toBe("error");
  });
});

describe("a custom page", () => {
  beforeEach(() =>
    mount(
      {
        id: "orders",
        title: "Orders",
        custom: true,
        html: SKETCH.options.html,
        states: STATES,
        tree: [],
      },
      BOARD_STATE,
    ),
  );

  it("is edited though its spec writes no tree, which reads as an empty one (fails when the editor refuses the spec)", () => {
    const spec = parseMockupSpec({
      version: 1,
      pages: [{ id: "board", title: "Board", custom: true, html: "<p>x</p>" }],
    });

    expect(spec?.pages[0]?.tree).toEqual([]);
  });

  it("picks the state the whole page is drawn in from the page's inspector, and a comment on the page keeps it (fails when a custom page has no picker or its pins drop the state)", async () => {
    await pick("empty");
    const drawn = drawnTree()[0]?.options?.html;
    await comment(200, 80, "Offer to add a card");

    expect(drawn).toBe(STATES.empty);
    expect(posted()[0]?.[1]?.body).toMatchObject({
      page: "orders",
      state: "empty",
      text: "Offer to add a card",
    });
    expect(posted()[0]?.[1]?.body).not.toHaveProperty("path");
  });
});
