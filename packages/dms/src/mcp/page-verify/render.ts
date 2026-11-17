import { TABLE_VIEW_COMPONENT_NAME } from "@antelopejs/interface-dms/component-options/internal/page-layout";
import type { BrowserContext, Frame, Page, Request } from "./playwright";
import { z } from "zod";
import { type PageProbe, type PageRect, probePage } from "./page-probe";
import type {
  ConsoleError,
  DataBlock,
  DataState,
  FailedRequest,
  RenderedBlock,
  Viewport,
  ViewportRender,
} from "./report";

const NAVIGATION_TIMEOUT_MS = 60_000;
const SETTLE_TIMEOUT_MS = 20_000;
const SETTLE_PAUSE_MS = 500;
const PROBE_ATTEMPTS = 10;
const PROBE_INTERVAL_MS = 500;
const EDGE_TOLERANCE_PX = 1;
/** Failures that are no fault of the page: a navigation cancelling its requests, and a write the run held back. */
const NETWORK_CHANGED = "net::ERR_NETWORK_CHANGED";
const EXPECTED_FAILURES = [
  "net::ERR_ABORTED",
  "net::ERR_BLOCKED_BY_CLIENT",
  NETWORK_CHANGED,
];
const RESOURCE_LOAD_ERROR = "Failed to load resource";
const HTTP_ERROR_STATUS = 400;

/**
 * Holds once the page has hydrated, drawn its content, and no data block
 * still waits for its first answer. Inertia marks a root the server
 * rendered `data-server-rendered`, and Vue sets `__vue_app__` on it once
 * mounted: before that the markup shows but no component is reachable.
 * Every dashboard layout marks the region holding the page
 * `data-dms-page-content`.
 */
const SETTLED = [
  `[...document.querySelectorAll("[data-server-rendered]")].every((root) => "__vue_app__" in root)`,
  `!!document.querySelector("[data-dms-page-content]")?.childElementCount`,
  `!document.querySelector("[data-dms-block-state=loading]")`,
].join(" && ");

/**
 * The options of a served block that name where it reads: `fetchUrl` for
 * most blocks; for a table view, the `source` of a `TableView.fromSource`
 * table, else the `location` of its data controller.
 */
interface LayoutNodeOptions {
  fetchUrl?: string;
  location?: string;
  source?: { fetchUrl?: string };
}

/** A component of a served layout: its children each sit under an id. */
interface LayoutNode {
  componentName?: string;
  options?: LayoutNodeOptions;
  children?: { id: string; component: LayoutNode }[];
}

const optionalString = z.string().optional().catch(undefined);

const LayoutNodeSchema: z.ZodType<LayoutNode, z.ZodTypeDef, unknown> = z.lazy(
  () =>
    z.object({
      componentName: z.string().optional(),
      options: z
        .object({
          fetchUrl: optionalString,
          location: optionalString,
          source: z
            .object({ fetchUrl: optionalString })
            .optional()
            .catch(undefined),
        })
        .optional()
        .catch(undefined),
      children: z
        .array(z.object({ id: z.string(), component: LayoutNodeSchema }))
        .optional(),
    }),
);

const LayoutSchema = z.object({ components: z.record(LayoutNodeSchema) });

/** A block the layout serves, at its layout path. */
export interface ExpectedBlock {
  path: string;
  component: string;
  /** The URL the block reads its data from, when its options name one. */
  source?: string;
}

/** The URL a block lists its data from, as its frontend component requests it. */
function sourceOf(node: LayoutNode): string | undefined {
  const options = node.options;
  if (node.componentName !== TABLE_VIEW_COMPONENT_NAME)
    return options?.fetchUrl;
  if (options?.source?.fetchUrl !== undefined) return options.source.fetchUrl;
  return options?.location === undefined
    ? undefined
    : `${options.location}/list`;
}

function collectBlocks(
  node: LayoutNode,
  blockPath: string,
  into: ExpectedBlock[],
): void {
  const source = sourceOf(node);
  into.push({
    path: blockPath,
    component: node.componentName ?? "",
    ...(source !== undefined && { source }),
  });
  for (const child of node.children ?? []) {
    collectBlocks(child.component, `${blockPath}.${child.id}`, into);
  }
}

/** The answer of a page's layout endpoint, for the signed-in account. */
export type LayoutAnswer =
  | { status: "served"; blocks: ExpectedBlock[] }
  | { status: "refused"; httpStatus: number };

/**
 * Reads the layout the page serves the context's account, through the
 * dashboard as the page itself does: the blocks it holds, or the refusal.
 */
export async function readLayout(
  context: Pick<BrowserContext, "request">,
  url: string,
): Promise<LayoutAnswer> {
  const response = await context.request.get(url);
  if (!response.ok())
    return { status: "refused", httpStatus: response.status() };
  const layout = LayoutSchema.parse(await response.json());
  const blocks: ExpectedBlock[] = [];
  for (const [key, node] of Object.entries(layout.components)) {
    collectBlocks(node, key, blocks);
  }
  return { status: "served", blocks };
}

/** Errors a page reports, labelled with the viewport being drawn. */
export interface ErrorSink {
  viewport: string;
  console: ConsoleError[];
  failedRequests: FailedRequest[];
}

/**
 * Records the console errors, uncaught exceptions and failed requests of a
 * page into `sink`. A resource the browser failed to load is recorded once,
 * as its request.
 */
export function captureErrors(
  page: Page,
  origin: string,
  sink: ErrorSink,
): void {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.startsWith(RESOURCE_LOAD_ERROR)) return;
    sink.console.push({ viewport: sink.viewport, text });
  });
  page.on("pageerror", (error) => {
    sink.console.push({
      viewport: sink.viewport,
      text: `${error.name}: ${error.message}`,
    });
  });
  page.on("response", (response) => {
    if (response.status() < HTTP_ERROR_STATUS) return;
    if (!response.url().startsWith(origin)) return;
    sink.failedRequests.push({
      viewport: sink.viewport,
      method: response.request().method(),
      url: response.url(),
      status: response.status(),
    });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    if (EXPECTED_FAILURES.some((expected) => failure.startsWith(expected)))
      return;
    sink.failedRequests.push({
      viewport: sink.viewport,
      method: request.method(),
      url: request.url(),
      status: failure,
    });
  });
}

/** Opens `url` and waits until its blocks have their first data. */
export async function openPage(page: Page | Frame, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
  await waitSettled(page);
}

/**
 * Opens `url`, and once more when the machine's network changed while it
 * loaded: Chromium then fails the requests in flight, so the page misses
 * modules it needs through no fault of its own.
 */
async function openSteadily(page: Page, url: string): Promise<void> {
  let changed = false;
  const listener = (request: Request): void => {
    if (request.failure()?.errorText.startsWith(NETWORK_CHANGED))
      changed = true;
  };
  page.on("requestfailed", listener);
  try {
    await openPage(page, url);
  } finally {
    page.off("requestfailed", listener);
  }
  if (changed) await openPage(page, url);
}

/** Waits until the page shows content and no block is loading, or gives up quietly. */
export async function waitSettled(page: Page | Frame): Promise<void> {
  await page
    .waitForFunction(SETTLED, undefined, { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => undefined);
  await page.waitForTimeout(SETTLE_PAUSE_MS);
}

function insideWidth(rect: PageRect, width: number): boolean {
  return (
    rect.x >= -EDGE_TOLERANCE_PX &&
    rect.x + rect.width <= width + EDGE_TOLERANCE_PX
  );
}

function overlaps(a: PageRect, b: PageRect): boolean {
  return (
    a.x + EDGE_TOLERANCE_PX < b.x + b.width &&
    b.x + EDGE_TOLERANCE_PX < a.x + a.width &&
    a.y + EDGE_TOLERANCE_PX < b.y + b.height &&
    b.y + EDGE_TOLERANCE_PX < a.y + a.height
  );
}

function overlappingTopLevel(probe: PageProbe): [string, string][] {
  const top = probe.blocks.filter(
    (block): block is typeof block & { rect: PageRect } =>
      !block.path.includes(".") && block.rect !== null,
  );
  const pairs: [string, string][] = [];
  top.forEach((block, index) => {
    for (const other of top.slice(index + 1)) {
      if (overlaps(block.rect, other.rect))
        pairs.push([block.path, other.path]);
    }
  });
  return pairs;
}

function dataStateOf(state: string): DataState {
  const states: readonly DataState[] = ["ok", "empty", "error", "loading"];
  return states.find((known) => known === state) ?? "error";
}

function issueStateOf(issue: string): DataState {
  return issue === "needs_backend" ? "needs_backend" : "unknown_block";
}

/** The data each block reports at one viewport, preview notices included. */
export function readDataBlocks(
  probe: PageProbe,
  viewport: string,
  expected: readonly ExpectedBlock[] = [],
): DataBlock[] {
  const reported = probe.dataBlocks.map((block) => {
    const source = expected.find(
      (served) => served.path === block.path,
    )?.source;
    return {
      path: block.path,
      type: block.type,
      state: dataStateOf(block.state),
      viewport,
      ...(source !== undefined && { source }),
    };
  });
  const notices = probe.blocks.flatMap((block) =>
    block.issue === undefined
      ? []
      : [
          {
            path: block.path,
            type: block.componentName ?? "",
            state: issueStateOf(block.issue),
            viewport,
          },
        ],
  );
  return [...reported, ...notices];
}

/** The page drawn at one viewport, with the probe the report was read from. */
export interface ViewportOutcome {
  render: ViewportRender;
  probe: PageProbe;
}

function renderedBlocks(
  expected: readonly ExpectedBlock[],
  probe: PageProbe,
): RenderedBlock[] {
  return expected.map((block) => {
    const rect = probe.blocks.find(
      (probed) => probed.path === block.path,
    )?.rect;
    const present = probe.blocks.some((probed) => probed.path === block.path);
    return {
      path: block.path,
      component: block.component,
      present,
      visible:
        rect !== undefined &&
        rect !== null &&
        insideWidth(rect, probe.documentWidth),
      ...(present &&
        (rect === undefined || rect === null) && { drewNothing: true }),
    };
  });
}

/**
 * Probes the page until it draws every block the layout serves, or the
 * attempts run out: a block mounts after hydration once its component has
 * loaded, so the first probe of a fresh page can come early.
 */
async function probeUntilDrawn(
  page: Page,
  expected: ExpectedBlock[],
): Promise<PageProbe> {
  let probe = await probePage(page);
  for (let attempt = 1; attempt < PROBE_ATTEMPTS; attempt += 1) {
    const drawn = new Set(probe.blocks.map((block) => block.path));
    if (expected.every((block) => drawn.has(block.path))) break;
    await page.waitForTimeout(PROBE_INTERVAL_MS);
    probe = await probePage(page);
  }
  return probe;
}

/** Draws the page at one viewport and reads its blocks, layout and data from the DOM. */
export async function renderAtViewport(
  page: Page,
  url: string,
  viewport: Viewport,
  expected: ExpectedBlock[],
): Promise<ViewportOutcome> {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await openSteadily(page, url);
  const probe = await probeUntilDrawn(page, expected);
  return {
    probe,
    render: {
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      blocks: renderedBlocks(expected, probe),
      layout: {
        horizontalOverflow:
          probe.documentWidth > probe.viewportWidth + EDGE_TOLERANCE_PX,
        overflowingBlocks: probe.blocks
          .filter(
            (block) =>
              block.rect !== null &&
              !insideWidth(block.rect, probe.viewportWidth),
          )
          .map((block) => block.path),
        overlappingBlocks: overlappingTopLevel(probe),
      },
    },
  };
}
