/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
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

const SALES = { id: "sales", title: "Sales", icon: "i-ph-storefront" };

const SPEC: MockupSpecDocument = {
  version: 1,
  categories: [SALES],
  pages: [
    { id: "home", title: "Home", tree: [] },
    { id: "orders", title: "Orders", category: "sales", tree: [] },
  ],
};

const STATE = mockupState({
  categories: [SALES],
  pages: [
    mockupPage({ id: "home", title: "Home", tree: [], paths: {} }),
    mockupPage({
      id: "orders",
      title: "Orders",
      category: "sales",
      tree: [],
      paths: {},
    }),
  ],
});

let runtime: MockupRuntime;
let viewer: MountedViewer;

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);

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

async function type(selector: string, value: string): Promise<void> {
  const input = find(selector);
  if (!(input instanceof HTMLInputElement)) throw new Error(`no ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await flush();
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await flush();
}

beforeEach(async () => {
  runtime = stubMockupRuntime({ spec: structuredClone(SPEC) });
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("editing the sidebar's sections", () => {
  it("hands the preview an editable sidebar of the pages under their sections (fails when the sections or the editing flag are lost)", () => {
    expect(rendered(viewer.posted).at(-1)?.navigation).toMatchObject({
      sections: [
        { items: [{ id: "home", label: "Home" }] },
        { category: SALES, items: [{ id: "orders", label: "Orders" }] },
      ],
      editable: true,
    });
  });

  it("writes a section the preview's sidebar adds, and undoes it in one step (fails when the frame's edit is dropped)", async () => {
    await viewer.say({
      type: "section-edit",
      edit: { kind: "addCategory", title: "Admin" },
    });
    await saved();
    expect(runtime.file.spec.categories).toEqual([
      SALES,
      { id: "admin", title: "Admin" },
    ]);

    await click("[data-dms-mockup-undo]");
    await saved();
    expect(runtime.file.spec.categories).toEqual([SALES]);
  });

  it("asks before deleting a section that holds pages, and moves them to the default section once confirmed (fails when it goes at once)", async () => {
    const version = runtime.file.version;
    await viewer.say({
      type: "section-edit",
      edit: { kind: "removeCategory", category: "sales" },
    });
    await saved();
    expect(runtime.file.version).toBe(version);
    expect(find("[data-dms-mockup-section-delete-pages]")).not.toBeNull();

    await click("[data-dms-mockup-section-delete-confirm]");
    await saved();
    expect(runtime.file.spec).toEqual({
      version: 1,
      pages: [
        { id: "home", title: "Home", tree: [] },
        { id: "orders", title: "Orders", tree: [] },
      ],
    });
  });

  it("adds a section from the page list's inline field, renames one on a double-click and gives it an icon from its menu (fails when the list edits nothing)", async () => {
    await click('[data-dms-mockup-panel-tab="pages"]');
    await click("[data-dms-mockup-section-new]");
    await type("[data-dms-mockup-section-new-name]", "Admin");
    find(
      '[data-dms-mockup-section="sales"] [data-dms-mockup-section-title]',
    )?.dispatchEvent(new MouseEvent("dblclick"));
    await flush();
    await type("[data-dms-mockup-section-name]", "Selling");
    await click(
      '[data-dms-mockup-section="sales"] [data-menu-item="dms.mockup.section_icon"]',
    );
    await type("[data-dms-mockup-section-icon]", "i-ph-coins");
    await saved();

    expect(runtime.file.spec.categories).toEqual([
      { id: "sales", title: "Selling", icon: "i-ph-coins" },
      { id: "admin", title: "Admin" },
    ]);
  });
});
