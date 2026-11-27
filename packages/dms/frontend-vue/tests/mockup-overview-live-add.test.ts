// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parsePreviewMessage,
  type PreviewInboundMessage,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import {
  mockupPage,
  mockupState,
  type MountedViewer,
} from "./helpers/mockup-runtime";
import { mountOverviewViewer, overviewDriver } from "./helpers/mockup-overview";

let viewer: MountedViewer;
const { findAll, measure, bootLive } = overviewDriver(() => viewer);

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

const HOME = mockupPage({
  id: "home",
  title: "Home",
  tree: [],
  paths: {},
});

const added = (id: string) =>
  mockupPage({
    id,
    title: id,
    tree: [{ type: "KpiCard", options: { title: id } }],
    paths: { "block-0": "/pages/0/tree/0" },
  });

type RenderedTree = Extract<PreviewInboundMessage, { type: "render" }>["tree"];

const posts = new Map<Window, PreviewInboundMessage[]>();

/** Records, cloned as a browser would, what the viewer posts each live frame from now on. */
function recordFrames(): void {
  for (const iframe of findAll("[data-dms-mockup-overview-preview]")) {
    const target =
      iframe instanceof HTMLIFrameElement ? iframe.contentWindow : null;
    if (!target || posts.has(target)) continue;
    const posted: PreviewInboundMessage[] = [];
    posts.set(target, posted);
    vi.spyOn(target, "postMessage").mockImplementation((message) => {
      const parsed = parsePreviewMessage(structuredClone(message));
      if (parsed) posted.push(parsed);
    });
  }
}

/** Boots the live frames one by one, as the board grows its pool, recording each before it says ready. */
async function bootRecorded(): Promise<void> {
  for (let frames = -1; frames !== posts.size; ) {
    frames = posts.size;
    recordFrames();
    await bootLive();
  }
}

/** The tree each live slot's frame was last told to draw, by page. */
function drawnTrees(): Map<string, RenderedTree | undefined> {
  const drawn = new Map<string, RenderedTree | undefined>();
  for (const slot of findAll("[data-dms-mockup-overview-slot]")) {
    const page = slot.getAttribute("data-dms-mockup-overview-slot") ?? "";
    const target = slot.querySelector("iframe")?.contentWindow;
    const renders = (target ? (posts.get(target) ?? []) : []).flatMap(
      (message) => (message.type === "render" ? [message.tree] : []),
    );
    drawn.set(page, renders.at(-1));
  }
  return drawn;
}

describe("the Overview board while the assistant adds pages", () => {
  it("draws each page a pushed state adds in its own slot, without a refresh (fails when a new slot keeps an empty preview)", async () => {
    ({ viewer } = await mountOverviewViewer(1, [], { name: "demo" }, [HOME]));
    await measure();
    await bootRecorded();

    await viewer.publish(
      "state",
      mockupState({ revision: 2, pages: [added("overview")] }),
    );
    await measure();
    await bootRecorded();
    await viewer.publish(
      "state",
      mockupState({
        revision: 3,
        pages: [added("overview"), HOME, added("orders"), added("returns")],
      }),
    );
    await measure();
    await bootRecorded();

    expect(drawnTrees()).toEqual(
      new Map([
        ["home", []],
        ["overview", added("overview").tree],
        ["orders", added("orders").tree],
        ["returns", added("returns").tree],
      ]),
    );
  });
});
