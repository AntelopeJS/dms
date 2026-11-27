// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockupPageState } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  flush,
  mockupPage,
  type MountedViewer,
} from "./helpers/mockup-runtime";
import { mountOverviewViewer, overviewDriver } from "./helpers/mockup-overview";

const SAMPLE_TREE = [{ type: "KpiCard", options: { title: "Sample" } }];
const REAL_TREE = [{ type: "KpiCard", options: { fetchUrl: "/api/kpi" } }];
const SAMPLE_SRC = "/dms-preview?fixtures=only";
const REAL_SRC = "/dms-preview";

const CONVERTED = mockupPage({
  id: "live",
  title: "Live",
  tree: SAMPLE_TREE,
  realTree: REAL_TREE,
  livePage: { ref: "/orders" },
});
const HAND_MADE = mockupPage({ id: "made", title: "Made", tree: SAMPLE_TREE });

let viewer: MountedViewer;
const { find, spyOn, sayFrom, measure, bootLive } = overviewDriver(
  () => viewer,
);

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

async function openBoard(pages: MockupPageState[]): Promise<void> {
  ({ viewer } = await mountOverviewViewer(
    pages.length,
    [],
    { name: "demo" },
    pages,
  ));
  await measure();
  await bootLive();
}

const frameSrc = (page: string) =>
  find(`[data-dms-mockup-overview-slot="${page}"] iframe`)?.getAttribute("src");

/** The tree the slot's preview is asked to draw once it reports ready again. */
async function drawnTree(page: string) {
  const posted = spyOn(page);
  await sayFrom(page, { type: "ready" });
  return posted.find((message) => message.type === "render")?.tree;
}

describe("the Overview board on real data", () => {
  it("draws a page converted from a live page with its live tree in the frame that allows live routes, and a hand-made one on its fixtures (fails when every slot is fixtures-only)", async () => {
    await openBoard([CONVERTED, HAND_MADE]);

    expect(frameSrc("live")).toBe(REAL_SRC);
    expect(await drawnTree("live")).toEqual(REAL_TREE);
    expect(frameSrc("made")).toBe(SAMPLE_SRC);
    expect(await drawnTree("made")).toEqual(SAMPLE_TREE);
  });

  it("shows the Real data switch on the Overview, and turning it off draws the converted page on its fixtures (fails when the switch stays hidden or the slots ignore it)", async () => {
    await openBoard([CONVERTED, HAND_MADE]);

    const toggle = find("[data-dms-mockup-real-data]");
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    toggle?.click();
    await flush();
    await bootLive();

    expect(
      find("[data-dms-mockup-real-data]")?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(frameSrc("live")).toBe(SAMPLE_SRC);
    expect(await drawnTree("live")).toEqual(SAMPLE_TREE);
  });

  it("has no Real data switch on a board without a live tree (fails when the switch shows for hand-made pages)", async () => {
    await openBoard([HAND_MADE]);

    expect(find("[data-dms-mockup-real-data]")).toBeNull();
  });
});
