/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import {
  parsePreviewMessage,
  parsePreviewOutboundMessage,
  PREVIEW_CHANNEL,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import type { JsonValue } from "../layers/dms-core/app/types/json";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";
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

function spec(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: [{ id: "revenue", type: "KpiCard", options: { title: "Revenue" } }],
      },
    ],
  };
}

const HEADER_FIELDS = {
  icon: "i-ph-shopping-cart",
  description: "Everything customers bought",
  headerActions: [
    { label: "New order", icon: "i-ph-plus", color: "primary" as const },
    { label: "Export", variant: "outline" as const },
  ],
};

let runtime: MockupRuntime;
let viewer: MountedViewer;

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);

async function written(): Promise<MockupSpecDocument> {
  await new Promise((resolve) =>
    setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
  );
  await flush();
  return runtime.file.spec;
}

function type(selector: string, value: string): Promise<void> {
  const field = find(selector);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    throw new Error(`no field ${selector}`);
  }
  field.value = value;
  field.dispatchEvent(new Event("input"));
  return flush();
}

async function click(selector: string): Promise<void> {
  find(selector)?.click();
  await flush();
}

beforeEach(async () => {
  runtime = stubMockupRuntime({ spec: spec() });
  viewer = await mountViewer();
  await viewer.publish(
    "state",
    mockupState({ pages: [mockupPage({ ...HEADER_FIELDS })] }),
  );
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("the page header of a mockup page", () => {
  it("asks the preview to draw the spec page's title, icon, description and buttons (fails when the render carries no header)", () => {
    expect(rendered(viewer.posted).at(-1)?.header).toEqual({
      title: "Orders",
      icon: "i-ph-shopping-cart",
      description: "Everything customers bought",
      actions: [
        { label: "New order", icon: "i-ph-plus", color: "primary" },
        { label: "Export", variant: "outline" },
      ],
    });
  });

  it("still carries the title of a page that sets no other field", async () => {
    await viewer.publish("state", mockupState({ pages: [mockupPage()] }));
    expect(rendered(viewer.posted).at(-1)?.header).toEqual({ title: "Orders" });
  });

  it("is picked by a click on it, which leaves the page's own inspector open", async () => {
    await viewer.say({ type: "select", path: "block-0" });
    await viewer.say({
      type: "layout",
      blocks: [
        { path: "block-0", rect: { x: 0, y: 200, width: 400, height: 100 } },
      ],
    });
    expect(find("[data-dms-mockup-selection]")).not.toBeNull();
    expect(find("[data-dms-mockup-page-inspector]")).toBeNull();

    await viewer.say({ type: "select-page" });

    expect(find("[data-dms-mockup-selection]")).toBeNull();
    expect(find("[data-dms-mockup-page-inspector]")).not.toBeNull();
  });
});

describe("editing the header through the history", () => {
  beforeEach(async () => {
    await viewer.publish("state", mockupState({ pages: [mockupPage()] }));
  });

  it("writes the icon and the description to spec.json, and one undo takes a whole typing back (fails on an undo step per keystroke)", async () => {
    for (const value of ["i-ph-b", "i-ph-bo", "i-ph-books"]) {
      await type("[data-dms-mockup-page-icon]", value);
    }
    expect((await written()).pages[0]).toMatchObject({ icon: "i-ph-books" });

    await type("[data-dms-mockup-page-inspector] textarea", "All the shelves");
    expect((await written()).pages[0]).toMatchObject({
      icon: "i-ph-books",
      description: "All the shelves",
    });

    await click("[data-dms-mockup-undo]");
    expect((await written()).pages[0]).not.toHaveProperty("description");
    await click("[data-dms-mockup-undo]");
    expect((await written()).pages[0]).not.toHaveProperty("icon");
    await click("[data-dms-mockup-redo]");
    expect((await written()).pages[0]).toMatchObject({ icon: "i-ph-books" });
  });

  it("takes a field out of the spec when it is emptied, rather than writing an empty one", async () => {
    await type("[data-dms-mockup-page-icon]", "i-ph-books");
    await written();
    await type("[data-dms-mockup-page-icon]", "");
    expect((await written()).pages[0]).not.toHaveProperty("icon");
  });

  it("adds, edits and removes a header button, each an undoable step", async () => {
    await click("[data-dms-mockup-header-action-add]");
    expect((await written()).pages[0]?.headerActions).toEqual([
      { label: "dms.mockup.header_action_default_label" },
    ]);

    await type("[data-dms-mockup-header-action-label]", "New order");
    expect((await written()).pages[0]?.headerActions).toEqual([
      { label: "New order" },
    ]);

    await click("[data-dms-mockup-header-action-remove]");
    expect((await written()).pages[0]).not.toHaveProperty("headerActions");

    await click("[data-dms-mockup-undo]");
    expect((await written()).pages[0]?.headerActions).toEqual([
      { label: "New order" },
    ]);
  });
});

describe("the preview protocol", () => {
  it("accepts a render with a header and refuses one whose button has a color or a variant no button takes", () => {
    const render = (actions: JsonValue) =>
      parsePreviewMessage({
        channel: PREVIEW_CHANNEL,
        type: "render",
        tree: [],
        header: { title: "Orders", actions },
      });
    expect(render([{ label: "New", color: "primary", variant: "soft" }])).toBeDefined();
    expect(render([{ label: "New", color: "purple" }])).toBeUndefined();
    expect(render([{ label: "New", variant: "bold" }])).toBeUndefined();
    expect(render([{ icon: "i-ph-plus" }])).toBeUndefined();
  });

  it("reads the page selection the preview reports", () => {
    expect(
      parsePreviewOutboundMessage({ channel: PREVIEW_CHANNEL, type: "select-page" }),
    ).toEqual({ channel: PREVIEW_CHANNEL, type: "select-page" });
  });
});
