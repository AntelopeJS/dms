/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const KPI: MockupBlockType = {
  type: "KpiCard",
  componentName: "dms-kpi-card",
  meta: { name: "KPI card", group: "visualization" },
  config: {
    title: { type: "string", ui: { label: "Title", group: "content" } },
    fetchUrl: { type: "string", optional: true, ui: { group: "data" } },
  },
  defaults: {},
};

function spec(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: [
          { id: "revenue", type: "KpiCard", options: { title: "Revenue" } },
          { id: "orders", type: "KpiCard", options: { title: "Orders" } },
        ],
      },
    ],
  };
}

const STATE = mockupState({
  pages: [
    mockupPage({
      options: {},
      tree: [],
      paths: { "block-0": "/pages/0/tree/0", "block-1": "/pages/0/tree/1" },
    }),
  ],
});
const RECTS = [
  { path: "block-0", rect: { x: 0, y: 40, width: 400, height: 100 } },
  { path: "block-1", rect: { x: 0, y: 160, width: 400, height: 100 } },
];

let runtime: MockupRuntime;
let viewer: MountedViewer;

/** Waits for the write, then has the stream send the state it compiles to, as the backend does. */
async function written(): Promise<MockupSpecDocument> {
  await new Promise((resolve) =>
    setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
  );
  await flush();
  const tree = runtime.file.spec.pages[0]?.tree ?? [];
  await viewer.publish(
    "state",
    mockupState({
      revision: runtime.file.version,
      pages: [
        mockupPage({
          options: {},
          tree: [],
          paths: Object.fromEntries(
            tree.map((_node, index) => [
              `block-${index}`,
              `/pages/0/tree/${index}`,
            ]),
          ),
        }),
      ],
    }),
  );
  await viewer.say({
    type: "layout",
    blocks: tree.map((_node, index) => ({
      path: `block-${index}`,
      rect: { x: 0, y: 40 + index * 120, width: 400, height: 100 },
    })),
  });
  return runtime.file.spec;
}

const titles = (document: MockupSpecDocument) =>
  document.pages[0]?.tree.map((node) => node.options?.title);
const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);

async function click(selector: string): Promise<void> {
  find(selector)?.click();
  await flush();
}

async function pick(path: string): Promise<void> {
  await viewer.say({ type: "select", path });
  await viewer.say({ type: "layout", blocks: RECTS });
}

function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
  return flush();
}

beforeEach(async () => {
  runtime = stubMockupRuntime({ spec: spec(), blocks: [KPI] });
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("edit mode", () => {
  it("writes an inspector edit to spec.json, and one undo takes the whole typing back (fails on an undo step per keystroke)", async () => {
    await pick("block-0");
    const field = find("[data-dms-mockup-field=title] input");
    if (!(field instanceof HTMLInputElement)) throw new Error("no title field");
    for (const value of ["T", "Tu", "Turnover"]) {
      field.value = value;
      field.dispatchEvent(new Event("input"));
    }
    expect(titles(await written())).toEqual(["Turnover", "Orders"]);
    await click("[data-dms-mockup-undo]");
    expect(await written()).toEqual(spec());
  });

  it("duplicates, moves and deletes from the toolbar, and undo and redo restore each exact spec (fails when undo is not exact)", async () => {
    await pick("block-0");
    await click("[data-dms-mockup-duplicate]");
    const duplicated = structuredClone(await written());
    expect(duplicated.pages[0]?.tree.map((node) => node.id)).toEqual([
      "revenue",
      "revenue-2",
      "orders",
    ]);
    await click("[data-dms-mockup-move-down]");
    expect((await written()).pages[0]?.tree.map((node) => node.id)).toEqual([
      "revenue",
      "orders",
      "revenue-2",
    ]);
    await click("[data-dms-mockup-remove]");
    expect(titles(await written())).toEqual(["Revenue", "Orders"]);
    await click("[data-dms-mockup-undo]");
    await click("[data-dms-mockup-undo]");
    expect(await written()).toEqual(duplicated);
    await click("[data-dms-mockup-redo]");
    expect((await written()).pages[0]?.tree.map((node) => node.id)).toEqual([
      "revenue",
      "orders",
      "revenue-2",
    ]);
  });

  it("hides the selection outline after a structural edit until the preview draws it (fails when the outline lands on the block that sat there before)", async () => {
    await pick("block-0");
    expect(find("[data-dms-mockup-selection]")).not.toBeNull();
    await click("[data-dms-mockup-duplicate]");
    await viewer.say({ type: "layout", blocks: RECTS });
    expect(find("[data-dms-mockup-selection]")).toBeNull();
    await written();
    expect(find("[data-dms-mockup-selection]")).not.toBeNull();
  });

  it("edits a double-clicked text in place: Enter keeps it, Escape drops it (fails when the option is not found by its text)", async () => {
    const font = {
      family: "Geist",
      size: "14px",
      weight: "600",
      lineHeight: "20px",
      letterSpacing: "normal",
      color: "rgb(0, 0, 0)",
      align: "start",
    };
    const rect = { x: 8, y: 48, width: 120, height: 20 };
    await viewer.say({
      type: "text",
      path: "block-1",
      text: "Orders",
      rect,
      font,
    });
    const input = find("[data-dms-mockup-inline-text]");
    if (!(input instanceof HTMLInputElement))
      throw new Error("no inline input");
    input.value = "Sales";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    expect(titles(await written())).toEqual(["Revenue", "Sales"]);

    await viewer.say({
      type: "text",
      path: "block-0",
      text: "Revenue",
      rect,
      font,
    });
    const again = find("[data-dms-mockup-inline-text]");
    if (!(again instanceof HTMLInputElement))
      throw new Error("no inline input");
    again.value = "Dropped";
    again.dispatchEvent(new Event("input"));
    again.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flush();
    expect(titles(await written())).toEqual(["Revenue", "Sales"]);
  });

  it("undoes with Ctrl+Z and redoes with Shift+Ctrl+Z outside a field (fails when the shortcut does nothing or both undo)", async () => {
    await pick("block-0");
    await click("[data-dms-mockup-remove]");
    expect(titles(await written())).toEqual(["Orders"]);
    await press("z", { ctrlKey: true });
    expect(await written()).toEqual(spec());
    await press("z", { ctrlKey: true, shiftKey: true });
    expect(titles(await written())).toEqual(["Orders"]);
  });

  it("adds a block from the catalog right after the selection, from a click or Enter (fails when it lands at the end)", async () => {
    await pick("block-0");
    await click("[data-dms-mockup-block-type=KpiCard]");
    expect((await written()).pages[0]?.tree).toEqual([
      { id: "revenue", type: "KpiCard", options: { title: "Revenue" } },
      { id: "kpi-card", type: "KpiCard", options: { title: "KPI card" } },
      { id: "orders", type: "KpiCard", options: { title: "Orders" } },
    ]);
  });

  it("drops a dragged block where the drop line shows (fails when the drop ignores the pointer)", async () => {
    await viewer.say({ type: "layout", blocks: RECTS });
    const source = find("[data-dms-mockup-block-type=KpiCard]");
    source?.dispatchEvent(new MouseEvent("dragstart", { bubbles: true }));
    await flush();
    const zone = find("[data-dms-mockup-drop-zone]");
    zone?.dispatchEvent(
      new MouseEvent("dragover", { clientX: 200, clientY: 180, bubbles: true }),
    );
    await flush();
    expect(find("[data-dms-mockup-drop-line]")?.style.top).toBe("157px");
    zone?.dispatchEvent(
      new MouseEvent("drop", { clientX: 200, clientY: 180, bubbles: true }),
    );
    expect((await written()).pages[0]?.tree.map((node) => node.id)).toEqual([
      "revenue",
      "kpi-card",
      "orders",
    ]);
  });
});

describe("a write still pending", () => {
  it("ignores a click on the preview, whose paths are those of the spec before the edit (fails when the click selects the block that sat there)", async () => {
    await pick("block-0");
    runtime.authFetch.mockImplementationOnce(async () => {
      throw Object.assign(new Error("boom"), { status: 500 });
    });
    await click("[data-dms-mockup-move-down]");
    await new Promise((resolve) =>
      setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
    );
    await flush();

    await viewer.say({ type: "select", path: "block-0" });

    const field = find("[data-dms-mockup-field=title] input");
    expect(field).toBeInstanceOf(HTMLInputElement);
    expect((field as HTMLInputElement).value).toBe("Revenue");
  });
});
