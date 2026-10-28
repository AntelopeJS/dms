// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowCanvas from "../layers/dms-ui/app/components/flow-canvas/FlowCanvas.vue";

let app: App | undefined;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

async function mountCanvas(props: Record<string, unknown>) {
  const deleted: string[][] = [];
  app = createApp({
    render: () =>
      h(FlowCanvas, {
        deletableNodes: true,
        grid: false,
        controls: false,
        fitViewOnInit: false,
        nodes: [
          {
            id: "users",
            position: { x: 10, y: 20 },
            data: { label: "Users" },
            selected: true,
          },
        ],
        ...props,
        onDeleteNodes: (ids: string[]) => deleted.push(ids),
      }),
  });
  app.config.globalProperties.$t = (key: string) => key;
  const container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
  await nextTick();
  return { root: container.firstElementChild as HTMLElement, deleted };
}

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const BADGE = ".dms-flow-canvas__delete-button";

describe("flow canvas delete badge", () => {
  it("draws a delete badge on a selected node by default", async () => {
    const { root, deleted } = await mountCanvas({});
    const badge = root.querySelector<HTMLButtonElement>(BADGE);
    expect(badge).not.toBeNull();
    badge!.click();
    expect(deleted).toEqual([["users"]]);
  });

  it("hides the badge on request and keeps keyboard deletion", async () => {
    const { root, deleted } = await mountCanvas({ deleteBadge: false });
    expect(root.querySelector(BADGE)).toBeNull();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(deleted).toEqual([["users"]]);
  });
});
