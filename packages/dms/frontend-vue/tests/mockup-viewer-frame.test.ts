/**
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewInboundMessage } from "../layers/dms-ui/app/entries/utils/blockPreview";
import { fillingHeight } from "../layers/dms-ui/app/entries/utils/mockupFrame";
import {
  flush,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

type SizeCallback = (entries: unknown[]) => void;

const sizeCallbacks: SizeCallback[] = [];

class FakeResizeObserver {
  constructor(callback: SizeCallback) {
    sizeCallbacks.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let viewer: MountedViewer | undefined;

/** Has the browser report a size for every observed element. */
async function resizeCanvas(width: number, height: number): Promise<void> {
  for (const callback of sizeCallbacks) {
    callback([{ contentRect: { width, height } }]);
  }
  await flush();
}

const floors = (posted: PreviewInboundMessage[]) =>
  posted.flatMap((message) =>
    message.type === "min-height" ? [message.height] : [],
  );

beforeEach(() => {
  sizeCallbacks.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  viewer?.unmount();
  viewer = undefined;
  vi.unstubAllGlobals();
});

describe("the page fills the canvas", () => {
  it("asks the preview for the canvas's visible height and draws the frame that tall (fails when a one-card page stops at its content)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await resizeCanvas(1400, 700);
    await viewer.say({ type: "resize", height: 190 });

    expect(floors(viewer.posted).at(-1)).toBe(700);
    expect(viewer.iframe.style.height).toBe("700px");
  });

  it("measures the visible height at the scale the frame is shrunk to (fails when a shrunk frame ends above the bottom)", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await resizeCanvas(640, 500);

    expect(floors(viewer.posted).at(-1)).toBe(1000);
    expect(viewer.iframe.style.height).toBe("1000px");
  });

  it("fills the canvas at the mobile width too", async () => {
    stubMockupRuntime({ query: { name: "demo", width: "mobile" } });
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await resizeCanvas(900, 620);

    expect(viewer.iframe.style.width).toBe("390px");
    expect(viewer.iframe.style.height).toBe("620px");
  });

  it("lets a longer page grow past the canvas, which then scrolls", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await resizeCanvas(1400, 700);
    await viewer.say({ type: "resize", height: 2100 });

    expect(viewer.iframe.style.height).toBe("2100px");
  });

  it("follows the canvas when the window is resized, and says it again to a preview that reloaded", async () => {
    stubMockupRuntime();
    viewer = await mountViewer();
    await viewer.publish("state", mockupState());
    await viewer.say({ type: "ready" });
    await resizeCanvas(1400, 700);
    await resizeCanvas(1400, 900);
    expect(floors(viewer.posted).at(-1)).toBe(900);
    expect(viewer.iframe.style.height).toBe("900px");

    await viewer.say({ type: "ready" });
    expect(floors(viewer.posted).at(-1)).toBe(900);
  });

  it("rounds down, so the shrunk frame never overflows the canvas", () => {
    expect(fillingHeight(500, 0.3)).toBe(1666);
    expect(fillingHeight(0, 1)).toBe(0);
    expect(fillingHeight(500, 0)).toBe(0);
  });
});
