/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
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
const CATALOG_ITEM = "[data-dms-mockup-block-type=KpiCard]";
const CAPTURE = "[data-dms-mockup-place-capture]";

let runtime: MockupRuntime;
let viewer: MountedViewer;

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);
const ids = () => runtime.file.spec.pages[0]?.tree.map((node) => node.id);

async function saved(): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
  );
  await flush();
}

async function click(selector: string): Promise<void> {
  find(selector)?.click();
  await flush();
}

function pointer(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

async function moveTo(x: number, y: number): Promise<void> {
  window.dispatchEvent(pointer("pointermove", x, y));
  find(CAPTURE)?.dispatchEvent(pointer("pointermove", x, y));
  await flush();
}

async function clickPage(x: number, y: number): Promise<void> {
  find(CAPTURE)?.dispatchEvent(pointer("click", x, y));
  await flush();
}

function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
  return flush();
}

async function pick(path: string): Promise<void> {
  await viewer.say({ type: "select", path });
  await viewer.say({ type: "layout", blocks: RECTS });
}

beforeEach(async () => {
  runtime = stubMockupRuntime({ spec: spec(), blocks: [KPI] });
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
  await viewer.say({ type: "layout", blocks: RECTS });
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("click to place a block", () => {
  it("arms the block instead of inserting it, with its name following the pointer (fails when a click on the catalog inserts)", async () => {
    const version = runtime.file.version;
    await click(CATALOG_ITEM);
    await saved();

    expect(runtime.file.version).toBe(version);
    expect(find(CAPTURE)).not.toBeNull();
    expect(find("[data-dms-mockup-placing-chip]")).toBeNull();

    await moveTo(100, 120);
    const chip = find("[data-dms-mockup-placing-chip]");
    expect(chip?.textContent?.trim()).toBe("KPI card");
    expect(chip?.style.left).toBe("114px");
    expect(chip?.style.top).toBe("134px");
  });

  it("shows the drop line the drag shows, and drops the block where the page is clicked (fails when the drop ignores the pointer)", async () => {
    await click(CATALOG_ITEM);
    await moveTo(200, 180);
    expect(find("[data-dms-mockup-drop-line]")?.style.top).toBe("157px");

    await clickPage(200, 180);
    await saved();

    expect(ids()).toEqual(["revenue", "kpi-card", "orders"]);
    expect(find(CAPTURE)).toBeNull();
    expect(find("[data-dms-mockup-placing-chip]")).toBeNull();
    expect(find("[data-dms-mockup-drop-line]")).toBeNull();
  });

  it("drops a block above the first one when the click is above it", async () => {
    await click(CATALOG_ITEM);
    await clickPage(200, 20);
    await saved();

    expect(ids()).toEqual(["kpi-card", "revenue", "orders"]);
  });

  it("places one block per arming: a second click on the page drops nothing", async () => {
    await click(CATALOG_ITEM);
    await clickPage(200, 180);
    await saved();
    const version = runtime.file.version;
    await clickPage(200, 20);
    await saved();

    expect(runtime.file.version).toBe(version);
  });

  it("cancels on Escape before it clears the selection (fails when Escape deselects first)", async () => {
    await pick("block-0");
    await click(CATALOG_ITEM);
    const version = runtime.file.version;

    await press("Escape");
    await saved();
    expect(find(CAPTURE)).toBeNull();
    expect(find("[data-dms-mockup-selection]")).not.toBeNull();
    expect(runtime.file.version).toBe(version);

    await press("Escape");
    expect(find("[data-dms-mockup-selection]")).toBeNull();
  });

  it("inserts after the selected block on Enter and disarms; without a selection Enter leaves it armed (fails when Enter appends at the end)", async () => {
    await click(CATALOG_ITEM);
    await press("Enter");
    await saved();
    expect(ids()).toEqual(["revenue", "orders"]);
    expect(find(CAPTURE)).not.toBeNull();

    await pick("block-0");
    await press("Enter");
    await saved();
    expect(ids()).toEqual(["revenue", "kpi-card", "orders"]);
    expect(find(CAPTURE)).toBeNull();
  });

  it("keeps the comment tool and the placement apart: arming one disarms the other", async () => {
    await click(CATALOG_ITEM);
    await press("c");
    expect(find(CAPTURE)).toBeNull();
    expect(find("[data-dms-mockup-pin-capture]")).not.toBeNull();

    await click(CATALOG_ITEM);
    expect(find(CAPTURE)).not.toBeNull();
    expect(find("[data-dms-mockup-pin-capture]")).toBeNull();
    expect(
      find("[data-dms-mockup-comment]")?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("lists the blocks as buttons, which Enter and Space click, so the keyboard arms them", () => {
    expect(find(CATALOG_ITEM)?.tagName).toBe("BUTTON");
  });
});
