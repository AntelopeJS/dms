// @vitest-environment jsdom
import { createApp, h, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import FlowCanvas from "../layers/dms-ui/app/components/flow-canvas/FlowCanvas.vue";

vi.mock("@vue-flow/core", async () => {
  const vue = await import("vue");
  const selectedNodes = vue.ref([
    {
      id: "users",
      computedPosition: { x: 10, y: 20 },
      dimensions: { width: 100, height: 40 },
    },
  ]);
  const Slotted = vue.defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        vue.h("div", slots.default?.()),
  });
  return {
    VueFlow: Slotted,
    Panel: Slotted,
    PanelPosition: {
      TopLeft: "top-left",
      TopCenter: "top-center",
      TopRight: "top-right",
      BottomLeft: "bottom-left",
      BottomCenter: "bottom-center",
      BottomRight: "bottom-right",
    },
    useVueFlow: () => ({
      viewport: vue.ref({ x: 0, y: 0, zoom: 1 }),
      getSelectedNodes: selectedNodes,
      zoomTo: () => undefined,
    }),
  };
});

vi.mock("@vue-flow/background", () => ({
  Background: { render: () => null },
}));
vi.mock("@vue-flow/controls", () => ({
  Controls: { render: () => null },
  ControlButton: { render: () => null },
}));
vi.mock("@vue-flow/minimap", () => ({ MiniMap: { render: () => null } }));

let app: App | undefined;

function mountCanvas(props: Record<string, unknown>) {
  const deleted: string[][] = [];
  app = createApp({
    render: () =>
      h(FlowCanvas, {
        deletableNodes: true,
        ...props,
        onDeleteNodes: (ids: string[]) => deleted.push(ids),
      }),
  });
  const container = document.createElement("div");
  app.mount(container);
  return { root: container.firstElementChild as HTMLElement, deleted };
}

afterEach(() => {
  app?.unmount();
  app = undefined;
});

const BADGE = ".dms-flow-canvas__delete-button";

describe("flow canvas delete badge", () => {
  it("draws a delete badge on a selected node by default", () => {
    const { root, deleted } = mountCanvas({});
    const badge = root.querySelector<HTMLButtonElement>(BADGE);
    expect(badge).not.toBeNull();
    badge!.click();
    expect(deleted).toEqual([["users"]]);
  });

  it("hides the badge on request and keeps keyboard deletion", () => {
    const { root, deleted } = mountCanvas({ deleteBadge: false });
    expect(root.querySelector(BADGE)).toBeNull();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(deleted).toEqual([["users"]]);
  });
});
