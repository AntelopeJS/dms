// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import type { MockupAnnotation } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  annotation,
  FakeEventSource,
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  REVIEWER_ACCESS,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const ANNOTATIONS_URL = "/api/mockup/demo/annotations";
const FRAME_HEIGHT = 600;
const STATE = mockupState({
  pages: [mockupPage({ paths: { "block-0": "/pages/0/tree/0" } })],
});
const LAYOUT = [
  { path: "block-0", rect: { x: 0, y: 40, width: 400, height: 100 } },
];
const OWNER = { userId: "owner", name: "Dev Owner" };

let runtime: MockupRuntime;
let viewer: MountedViewer;

/** Mounts the viewer as `access` says, on one page with the notes given. */
async function mount(
  notes: MockupAnnotation[] = [],
  access = REVIEWER_ACCESS,
): Promise<void> {
  runtime = stubMockupRuntime({ notes, access });
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
  await viewer.say({ type: "resize", height: FRAME_HEIGHT });
  await viewer.say({ type: "layout", blocks: LAYOUT });
}

afterEach(() => {
  viewer?.unmount();
  vi.unstubAllGlobals();
});

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);
const writes = () =>
  runtime.authFetch.mock.calls.filter(([, init]) => init?.method);
const fetched = (url: string) =>
  runtime.authFetch.mock.calls.some(([called]) => called === url);

function pointer(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

async function click(selector: string): Promise<void> {
  find(selector)?.click();
  await flush();
}

/** Opens the card of the pin `id`: a press and release opens a pin the viewer may drag, a click one they may not. */
async function openPin(id: string): Promise<void> {
  const pin = find(`[data-dms-mockup-pin="${id}"]`);
  pin?.dispatchEvent(pointer("pointerdown", 5, 5));
  window.dispatchEvent(pointer("pointerup", 5, 5));
  await flush();
  if (!find(`[data-dms-mockup-pin-card="${id}"]`)) pin?.click();
  await flush();
}

async function type(selector: string, text: string): Promise<void> {
  const field = viewer.host.querySelector<HTMLTextAreaElement>(selector);
  if (!field) throw new Error(`No field ${selector}`);
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await flush();
}

function press(key: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  return flush();
}

describe("a reviewer's viewer", () => {
  it("draws the page with no way to edit it, and runs it as in Preview under the pins (fails when a reviewer sees the editing panels or a click selects a block)", async () => {
    await mount();

    expect(find("[data-dms-mockup-review-hint]")).not.toBeNull();
    expect(find("[data-dms-mockup-edit-panel]")).toBeNull();
    expect(find("[data-dms-mockup-inspector]")).toBeNull();
    expect(find("[data-dms-mockup-build]")).toBeNull();
    expect(find("[data-dms-mockup-history]")).toBeNull();
    expect(find("[data-dms-mockup-undo]")).toBeNull();
    expect(find("[data-dms-mockup-panel-toggle]")).toBeNull();
    expect(find("[data-dms-mockup-title-edit]")).toBeNull();
    expect(find("[data-dms-mockup-title]")?.textContent?.trim()).toBe("demo");
    expect(find("[data-dms-mockup-back]")?.getAttribute("to")).toBe("/mockup");
    expect(find("[data-dms-mockup-comment]")).not.toBeNull();
    expect(find("[data-dms-mockup-preview-toggle]")).not.toBeNull();
    expect(
      viewer.posted.filter((message) => message.type === "inspect").at(-1),
    ).toMatchObject({ enabled: false });
  });

  it("reads neither the spec nor the block catalog, which the backend keeps for the owner (fails when a reviewer's viewer asks for the owner's routes)", async () => {
    await mount();

    expect(fetched("/api/mockup/demo/spec")).toBe(false);
    expect(fetched("/api/mockup/schema/blocks")).toBe(false);
    expect(fetched("/api/mockup/demo/annotations")).toBe(true);
  });

  it("pins a comment like the owner would, and hides the bar that hands comments to the AI (fails when a reviewer cannot comment or is offered Resolve with AI)", async () => {
    await mount([annotation({ author: OWNER })]);

    await press("c");
    find("[data-dms-mockup-pin-capture]")?.dispatchEvent(
      pointer("click", 200, 90),
    );
    await flush();
    await type('[data-dms-mockup-pin-card="draft"] textarea', "Wider, please");
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
            path: "/pages/0/tree/0",
            offset: { x: 0.5, y: 0.5 },
            text: "Wider, please",
          },
        },
      ],
    ]);
    expect(find("[data-dms-mockup-resolve-bar]")).toBeNull();
  });
});

describe("a reviewer's comments", () => {
  it("shows the owner's note read-only with its author, lets the reviewer resolve it and reply, and neither rewrite, drag nor delete it (fails when a reviewer gets the owner's note to edit)", async () => {
    await mount([annotation({ author: OWNER })]);

    await openPin("a1");
    const card = '[data-dms-mockup-pin-card="a1"]';

    expect(find(`${card} [data-dms-mockup-pin-author]`)?.textContent).toContain(
      "Dev Owner",
    );
    expect(find(`${card} [data-dms-mockup-pin-text]`)?.textContent).toContain(
      "Tighten the spacing",
    );
    expect(
      find(`${card} textarea:not([data-dms-mockup-reply-input])`),
    ).toBeNull();
    expect(find(`${card} [data-dms-mockup-pin-delete]`)).toBeNull();
    expect(find(`${card} [data-dms-mockup-pin-save]`)).toBeNull();
    expect(find(`${card} [data-dms-mockup-pin-status]`)).not.toBeNull();
    expect(find('[data-dms-mockup-pin="a1"]')?.className).toContain(
      "cursor-pointer",
    );

    await type(`${card} [data-dms-mockup-reply-input]`, "Full width works");
    await click(`${card} [data-dms-mockup-reply-send]`);
    await click(`${card} [data-dms-mockup-pin-status]`);

    expect(writes()).toEqual([
      [
        `${ANNOTATIONS_URL}/a1/replies`,
        { method: "POST", body: { text: "Full width works" } },
      ],
      [
        `${ANNOTATIONS_URL}/a1`,
        { method: "PATCH", body: { status: "resolved" } },
      ],
    ]);
  });

  it("lets the reviewer rewrite and delete their own note (fails when a reviewer is refused their own note)", async () => {
    await mount([annotation({ author: REVIEWER_ACCESS })]);

    await openPin("a1");
    const card = '[data-dms-mockup-pin-card="a1"]';

    expect(
      find(`${card} textarea:not([data-dms-mockup-reply-input])`),
    ).not.toBeNull();
    expect(find(`${card} [data-dms-mockup-pin-delete]`)).not.toBeNull();
    expect(find('[data-dms-mockup-pin="a1"]')?.className).toContain(
      "cursor-grab",
    );
  });

  it("lists the replies under a note and offers to delete only the reviewer's own (fails when a reviewer can delete the owner's reply)", async () => {
    await mount([
      annotation({
        author: OWNER,
        replies: [
          {
            id: "r1",
            author: OWNER,
            text: "How wide?",
            createdAt: "2026-11-07T10:30:00.000Z",
          },
          {
            id: "r2",
            author: REVIEWER_ACCESS,
            text: "Full width",
            createdAt: "2026-11-07T10:40:00.000Z",
          },
        ],
      }),
    ]);

    await openPin("a1");
    const replies = [
      ...viewer.host.querySelectorAll<HTMLElement>(
        "[data-dms-mockup-pin-reply]",
      ),
    ];
    const textOf = (reply: HTMLElement, part: string) =>
      reply
        .querySelector(`[data-dms-mockup-reply-${part}]`)
        ?.textContent?.trim();

    expect(
      replies.map((reply) => [textOf(reply, "author"), textOf(reply, "text")]),
    ).toEqual([
      ["Dev Owner", "How wide?"],
      ["Me", "Full width"],
    ]);
    expect(
      replies.map(
        (reply) =>
          reply.querySelector("[data-dms-mockup-reply-delete]") !== null,
      ),
    ).toEqual([false, true]);

    await click(
      '[data-dms-mockup-pin-reply="r2"] [data-dms-mockup-reply-delete]',
    );

    expect(writes()).toEqual([
      [`${ANNOTATIONS_URL}/a1/replies/r2`, { method: "DELETE" }],
    ]);
  });
});

describe("the owner's viewer with signed notes", () => {
  it("edits anyone's note and deletes anyone's reply (fails when the owner is held to their own notes)", async () => {
    await mount(
      [
        annotation({
          author: { userId: "client", name: "Claire Client" },
          replies: [
            {
              id: "r1",
              author: { userId: "client", name: "Claire Client" },
              text: "Still wanted",
              createdAt: "2026-11-07T10:30:00.000Z",
            },
          ],
        }),
      ],
      { role: "owner", userId: "me", name: "Me" },
    );

    await openPin("a1");
    const card = '[data-dms-mockup-pin-card="a1"]';

    expect(find(`${card} [data-dms-mockup-pin-author]`)?.textContent).toContain(
      "Claire Client",
    );
    expect(
      find(`${card} textarea:not([data-dms-mockup-reply-input])`),
    ).not.toBeNull();
    expect(find(`${card} [data-dms-mockup-pin-delete]`)).not.toBeNull();
    expect(
      find('[data-dms-mockup-pin-reply="r1"] [data-dms-mockup-reply-delete]'),
    ).not.toBeNull();
    expect(find("[data-dms-mockup-edit-panel]")).not.toBeNull();
    expect(find("[data-dms-mockup-build]")).not.toBeNull();
    expect(fetched("/api/mockup/demo/spec")).toBe(true);
  });
});

describe("a member the backend refuses", () => {
  it("says the mockup cannot be opened and opens no stream (fails when a refused viewer draws the workbench)", async () => {
    stubMockupRuntime({ access: 403 });
    const { default: MockupViewer } = await import(
      "../layers/dms-ui/app/components/block-preview/MockupViewer.vue"
    );
    const host = document.createElement("div");
    const app = createApp(MockupViewer);
    app.component("UAlert", (props: { title?: string }) => props.title);
    app.mount(host);
    await flush();
    await flush();

    expect(host.querySelector("[data-dms-mockup-viewer]")).toBeNull();
    expect(host.textContent).toContain("dms.mockup.access_denied");
    expect(FakeEventSource.instances).toEqual([]);
    app.unmount();
  });
});
