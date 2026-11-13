/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockupPageState } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  rendered,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const SAMPLE_TREE = [
  {
    type: "KpiCard",
    options: { fetchUrl: "/api/mockup/demo/pages/orders/fixtures/api-kpi" },
  },
];
const REAL_TREE = [{ type: "KpiCard", options: { fetchUrl: "/api/kpi" } }];

const CONVERTED = mockupPage({
  tree: SAMPLE_TREE,
  realTree: REAL_TREE,
  livePage: { ref: "/orders" },
});

let viewer: MountedViewer;

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

async function open(
  page: MockupPageState,
  query: Record<string, string> = { name: "demo" },
): Promise<void> {
  stubMockupRuntime({ query });
  viewer = await mountViewer();
  await viewer.publish("state", mockupState({ pages: [page] }));
  await viewer.say({ type: "ready" });
}

const toggle = () =>
  viewer.host.querySelector<HTMLElement>("[data-dms-mockup-real-data]");
const lastTree = () => rendered(viewer.posted).at(-1)?.tree;

describe("Real data", () => {
  it("is on for a page converted from a live page and draws its live routes (fails on a toggle off by default)", async () => {
    await open(CONVERTED);

    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(lastTree()).toEqual(REAL_TREE);
  });

  it("draws the sample fixtures once turned off, and no live route (fails when the toggle does not redraw)", async () => {
    await open(CONVERTED);

    toggle()?.click();
    await flush();

    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    expect(lastTree()).toEqual(SAMPLE_TREE);
  });

  it("starts off on a page with live routes the developer did not convert (fails on Real data on for every mockup with routes)", async () => {
    const { livePage: _livePage, ...wired } = CONVERTED;
    await open(wired);

    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    expect(lastTree()).toEqual(SAMPLE_TREE);
  });

  it("is absent from a hand-made mockup, which draws its fixtures even with ?data=real (fails on a toggle that reads the query alone)", async () => {
    await open(mockupPage({ tree: SAMPLE_TREE }), {
      name: "demo",
      data: "real",
    });

    expect(toggle()).toBeNull();
    expect(lastTree()).toEqual(SAMPLE_TREE);
  });

  it("follows ?data=sample on a converted page (fails when the query cannot override the default)", async () => {
    await open(CONVERTED, { name: "demo", data: "sample" });

    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    expect(lastTree()).toEqual(SAMPLE_TREE);
  });
});
