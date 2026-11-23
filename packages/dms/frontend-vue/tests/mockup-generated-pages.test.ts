/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flush,
  mockupPage,
  mockupState,
  rendered,
  type MountedViewer,
} from "./helpers/mockup-runtime";
import {
  mountOverviewViewer,
  overviewDriver,
  overviewPages,
} from "./helpers/mockup-overview";

let viewer: MountedViewer;

const { find, frameIds, measure } = overviewDriver(() => viewer);

const GENERATED = mockupPage({
  id: "p1.tree-0.edit",
  title: "Edit entry",
  generated: true,
  menu: false,
  parent: "p1",
  route: { param: "id", sample: "o1" },
  tree: [{ type: "Form", options: { fields: [] } }],
  paths: {},
});

async function mount(query: Record<string, string>): Promise<void> {
  ({ viewer } = await mountOverviewViewer(2, [], query));
  await viewer.publish(
    "state",
    mockupState({ pages: [...overviewPages(2), GENERATED] }),
  );
  await flush();
}

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("a generated form page", () => {
  it("is drawn on its own URL with its header and row, under its table's menu entry (fails when the viewer does not find it)", async () => {
    await mount({ name: "demo", page: "p1.tree-0.edit", record: "o2" });

    const render = rendered(viewer.posted).at(-1);
    expect(render?.header?.title).toBe("Edit entry");
    expect(render?.params).toEqual({ id: "o2" });
    expect(render?.navigation?.active).toBe("p1");
  });

  it("offers nothing to edit or pin: no editing panel, no pins (fails when the page is edited as the first spec page)", async () => {
    await mount({ name: "demo", page: "p1.tree-0.edit", record: "o2" });

    expect(find("[data-dms-mockup-edit-panel]")).toBeNull();
    expect(find("[data-dms-mockup-pins]")).toBeNull();
    await viewer.say({ type: "ready" });
    expect(find("[data-dms-mockup-edit-panel]")).toBeNull();
  });

  it("is left out of the Overview, which lays out the spec's pages alone (fails when the Overview draws a frame for it)", async () => {
    await mount({ name: "demo" });
    await measure();

    expect(frameIds()).toEqual(["p1", "p2"]);
  });
});
