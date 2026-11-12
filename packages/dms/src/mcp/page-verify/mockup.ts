import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Frame, Page } from "./playwright";
import { type ProbedBlock, probePage } from "./page-probe";
import { fileSegment, type ShotStore, shootBlock, shotFile } from "./render";
import type {
  MockupBlockComparison,
  MockupComparison,
  RenderedBlock,
  Viewport,
} from "./report";

const PREVIEW_PATH = "/dms-preview";
const FRAME_TIMEOUT_MS = 20_000;
const POLL_MS = 250;
const HTTP_NOT_FOUND = 404;

/** The mockup page a run compares the page with. */
export interface MockupTarget {
  name: string;
  /** The mockup page id; the viewer's first page when absent. */
  page?: string;
}

function viewerUrl(origin: string, target: MockupTarget): string {
  const url = new URL("/mockup", origin);
  url.searchParams.set("name", target.name);
  url.searchParams.set("width", "desktop");
  if (target.page !== undefined) url.searchParams.set("page", target.page);
  return url.href;
}

async function drawnPreview(
  page: Page,
): Promise<{ frame: Frame; blocks: ProbedBlock[] } | undefined> {
  const deadline = Date.now() + FRAME_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes(PREVIEW_PATH));
    const probe = frame
      ? await probePage(frame).catch(() => undefined)
      : undefined;
    if (frame && probe && probe.blocks.length > 0)
      return { frame, blocks: probe.blocks };
    await page.waitForTimeout(POLL_MS);
  }
  return undefined;
}

/**
 * Pairs each mockup block with a page block: the one at the same layout
 * path drawing the same component, else the first unpaired one drawing it,
 * in page order.
 */
function pairBlocks(
  mockupBlocks: ProbedBlock[],
  pageBlocks: RenderedBlock[],
): Map<string, RenderedBlock> {
  const paired = new Map<string, RenderedBlock>();
  const taken = new Set<string>();
  const take = (
    mockup: ProbedBlock,
    block: RenderedBlock | undefined,
  ): void => {
    if (block === undefined) return;
    paired.set(mockup.path, block);
    taken.add(block.path);
  };
  for (const mockup of mockupBlocks) {
    take(
      mockup,
      pageBlocks.find(
        (block) =>
          block.path === mockup.path &&
          block.component === mockup.componentName,
      ),
    );
  }
  for (const mockup of mockupBlocks) {
    if (paired.has(mockup.path)) continue;
    take(
      mockup,
      pageBlocks.find(
        (block) =>
          !taken.has(block.path) && block.component === mockup.componentName,
      ),
    );
  }
  return paired;
}

function unavailable(target: MockupTarget, reason: string): MockupComparison {
  return {
    mockup: target.name,
    page: target.page ?? "",
    blocks: [],
    extraPageBlocks: [],
    unavailable: reason,
  };
}

async function compareDrawn(
  page: Page,
  drawn: { frame: Frame; blocks: ProbedBlock[] },
  target: MockupTarget,
  pageBlocks: RenderedBlock[],
  store: ShotStore,
): Promise<MockupComparison> {
  const folder = [
    "mockup",
    fileSegment(target.name),
    fileSegment(target.page ?? "default"),
  ];
  await mkdir(path.join(store.dir, ...folder), { recursive: true });
  const full = shotFile(store, [...folder, "mockup.png"]);
  await page.locator("iframe").first().screenshot({ path: full.file });
  const paired = pairBlocks(drawn.blocks, pageBlocks);
  const blocks: MockupBlockComparison[] = [];
  for (const mockup of drawn.blocks) {
    const match = paired.get(mockup.path);
    const mockupScreenshot = await shootBlock(
      drawn.frame,
      mockup.path,
      shotFile(store, [...folder, `${fileSegment(mockup.path)}.png`]),
    );
    blocks.push({
      mockupPath: mockup.path,
      type: mockup.componentName ?? mockup.issue ?? "",
      status: match ? "matched" : "missing",
      ...(match && { pagePath: match.path }),
      ...(mockupScreenshot && { mockupScreenshot }),
      ...(match?.screenshot && { pageScreenshot: match.screenshot }),
    });
  }
  const pairedPaths = new Set([...paired.values()].map((block) => block.path));
  return {
    mockup: target.name,
    page: target.page ?? "",
    screenshot: full.relative,
    blocks,
    extraPageBlocks: pageBlocks
      .filter((block) => !pairedPaths.has(block.path))
      .map((block) => block.path),
  };
}

/**
 * Draws the mockup page in the dashboard's `/mockup` viewer at the desktop
 * width and pairs its blocks with the page's, each pair screenshotted for a
 * side-by-side look.
 */
export async function compareWithMockup(
  context: BrowserContext,
  origin: string,
  target: MockupTarget,
  pageBlocks: RenderedBlock[],
  options: { store: ShotStore; viewport: Viewport },
): Promise<MockupComparison> {
  const page = await context.newPage();
  try {
    await page.setViewportSize({
      width: options.viewport.width,
      height: options.viewport.height,
    });
    const response = await page.goto(viewerUrl(origin, target), {
      waitUntil: "load",
    });
    if (response?.status() === HTTP_NOT_FOUND) {
      return unavailable(
        target,
        "The dashboard serves no /mockup viewer: it ships with the mockup engine, in development only.",
      );
    }
    const drawn = await drawnPreview(page);
    if (drawn === undefined) {
      return unavailable(
        target,
        `The mockup "${target.name}" drew no block within ${FRAME_TIMEOUT_MS / 1000} s: check its name, its page id and its spec issues.`,
      );
    }
    return await compareDrawn(page, drawn, target, pageBlocks, options.store);
  } finally {
    await page.close();
  }
}
