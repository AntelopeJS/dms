import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Frame, Page } from "./playwright";
import { blockSelector, type ProbedBlock, probePage } from "./page-probe";
import type {
  MockupBlockComparison,
  MockupComparison,
  RenderedBlock,
  Viewport,
} from "./report";

const PREVIEW_PATH = "/dms-preview";
const FRAME_TIMEOUT_MS = 20_000;
const POLL_MS = 500;
/** The custom component `/dms-preview` draws the previewed tree in. */
const PREVIEW_HOST = "DmsBlockPreview";
const HTTP_NOT_FOUND = 404;
const BLOCK_SHOT_TIMEOUT_MS = 5_000;
/** The viewer's data mode that draws a page on its fixtures, never on the live routes it maps. */
const SAMPLE_DATA = "sample";

/** Where a run writes the mockup's screenshots, and how a written file reads in the report. */
export interface ShotStore {
  projectPath: string;
  /** Absolute folder of the run. */
  dir: string;
}

/** A screenshot file: where it is written, and how the report names it. */
interface ShotFile {
  file: string;
  /** Relative to the project. */
  relative: string;
}

function shotFile(store: ShotStore, segments: string[]): ShotFile {
  const file = path.join(store.dir, ...segments);
  return { file, relative: path.relative(store.projectPath, file) };
}

/** A file name segment from a mockup name or a layout path. */
function fileSegment(value: string): string {
  return value.replace(/^\/+/, "").replace(/[^A-Za-z0-9_.-]+/g, "_") || "root";
}

/** Screenshots a block of the preview frame, quietly skipping one that cannot be drawn. */
async function shootBlock(
  frame: Frame,
  blockPath: string,
  file: ShotFile,
): Promise<string | undefined> {
  try {
    await frame
      .locator(blockSelector(blockPath))
      .first()
      .screenshot({ path: file.file, timeout: BLOCK_SHOT_TIMEOUT_MS });
    return file.relative;
  } catch {
    return undefined;
  }
}

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
  url.searchParams.set("data", SAMPLE_DATA);
  if (target.page !== undefined) url.searchParams.set("page", target.page);
  return url.href;
}

/** The blocks of the preview frame, the frame's own host component left out. */
async function previewBlocks(frame: Frame): Promise<ProbedBlock[]> {
  const probe = await probePage(frame).catch(() => undefined);
  return (probe?.blocks ?? []).filter(
    (block) => block.componentName !== PREVIEW_HOST,
  );
}

/**
 * Waits until the preview frame draws the mockup and its blocks stop
 * changing: nested blocks mount after their parents, once their own
 * components have loaded.
 */
async function drawnPreview(
  page: Page,
): Promise<{ frame: Frame; blocks: ProbedBlock[] } | undefined> {
  const deadline = Date.now() + FRAME_TIMEOUT_MS;
  let previous = "";
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes(PREVIEW_PATH));
    const blocks = frame ? await previewBlocks(frame) : [];
    const drawn = blocks.map((block) => block.path).join(" ");
    if (frame && blocks.length > 0 && drawn === previous) {
      return { frame, blocks };
    }
    previous = drawn;
    await page.waitForTimeout(POLL_MS);
  }
  return undefined;
}

/**
 * Pairs each mockup block with a page block: the one at the same layout
 * path drawing the same component, else the first unpaired one drawing it,
 * in page order.
 */
export function pairBlocks(
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
 * width, on its fixtures, and pairs its blocks with the page's. The mockup
 * and each of its blocks are screenshotted; the page is not, since it shows
 * the values of its rows. The viewer is owner-only, so `context` is signed
 * in as the platform owner whatever role the page was opened as.
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
