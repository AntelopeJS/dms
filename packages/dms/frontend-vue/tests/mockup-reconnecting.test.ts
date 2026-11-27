// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  rendered,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const REVENUE = { type: "KpiCard", options: { title: "Revenue" } };
const SHOP = mockupState({ pages: [mockupPage({ tree: [REVENUE] })] });

let viewer: MountedViewer | undefined;

beforeEach(() => {
  stubMockupRuntime();
});

afterEach(() => {
  viewer?.unmount();
  viewer = undefined;
  vi.unstubAllGlobals();
});

const reconnecting = () =>
  viewer?.host.querySelector("[data-dms-mockup-reconnecting]") ?? null;

describe("the canvas while the mockup stream is down", () => {
  it("covers the preview with a reconnecting state when the stream drops, and draws the page again when it comes back (fails when the canvas shows no reconnecting state, or keeps it after the stream reopens)", async () => {
    viewer = await mountViewer();
    const { stream, publish, say, posted } = viewer;
    stream.emit("open", {});
    await publish("state", SHOP);
    await say({ type: "ready" });
    expect(reconnecting()).toBeNull();

    stream.emit("error", {});
    await flush();
    expect(reconnecting()?.getAttribute("role")).toBe("status");
    expect(reconnecting()?.textContent).toContain("dms.mockup.disconnected");

    const drawn = rendered(posted).length;
    stream.emit("open", {});
    await publish("state", mockupState({ ...SHOP, revision: 2 }));
    expect(reconnecting()).toBeNull();
    expect(rendered(posted).slice(drawn).at(-1)?.tree).toEqual([REVENUE]);
  });

  it("shows no reconnecting state before the stream sent a first state (fails when the waiting canvas is covered too)", async () => {
    viewer = await mountViewer();
    viewer.stream.emit("error", {});
    await flush();

    expect(reconnecting()).toBeNull();
  });
});
