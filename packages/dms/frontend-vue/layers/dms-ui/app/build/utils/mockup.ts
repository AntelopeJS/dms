import {
  isNumber,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import { isPreviewTree, type PreviewNode } from "./blockPreview";

/**
 * The dev-only mockup API the viewer reads (`/api/mockup`): the compiled state
 * of a spec file, its annotations, and the list of specs.
 */

/** A problem in `spec.json`, at a JSON pointer into it (`""` is the whole file). */
export interface MockupIssue {
  path: string;
  message: string;
}

export interface MockupPageOptions {
  theme?: string;
  locale?: string;
  padding?: boolean;
}

export interface MockupLivePage {
  /** Its builder ref, the page "Build it" updates. */
  ref: string;
}

export interface MockupPageState {
  id: string;
  title: string;
  options: MockupPageOptions;
  /** What `DmsBlockPreview` draws: fixtures resolved, sketch nodes passed through. */
  tree: PreviewNode[];
  /**
   * `tree` reading its live routes instead of fixtures, drawn with Real data
   * on. Present only when the page names live routes.
   */
  realTree?: PreviewNode[];
  livePage?: MockupLivePage;
  /** Spec JSON pointer of each node, keyed by the layout path the preview gives it. */
  paths: Record<string, string>;
}

export interface MockupState {
  name: string;
  title?: string;
  /** Moves on every successful read of the spec file. */
  revision: number;
  pages: MockupPageState[];
  issues: MockupIssue[];
}

export type MockupAnnotationStatus = "open" | "resolved";

/**
 * The block a note is about: the node whose id is `block`, on the page `page`
 * when set, then the children whose ids are `steps`.
 */
export interface MockupBlockAnchor {
  block: string;
  steps: string[];
  page?: string;
}

export interface MockupAnnotation {
  id: string;
  anchor?: MockupBlockAnchor;
  /** The page the note's block is on now. Absent when the block was removed. */
  page?: string;
  /** Spec JSON pointer of the note's block now. Absent when the block was removed. */
  path?: string;
  text: string;
  status: MockupAnnotationStatus;
  createdAt: string;
  resolvedAt?: string;
}

/** What `POST /api/mockup/:name/annotations` takes. */
export interface MockupAnnotationDraft {
  page: string;
  path: string;
  text: string;
}

/** Who wrote a mockup: the dashboard chat, Claude Code or Codex. */
export type MockupSource = "chat" | "claude-code" | "codex";

export const MOCKUP_SOURCES: readonly MockupSource[] = [
  "chat",
  "claude-code",
  "codex",
];

/** A page a built mockup made: a path of the dashboard, and its link's text. */
export interface MockupBuiltPage {
  path: string;
  title: string;
  /** The mockup page linked to the live page, which an update from the page converts over. */
  pageId?: string;
  /** Whether the live page changed since its linked mockup page was converted or built. */
  changed: boolean;
}

interface MockupSummaryBase {
  name: string;
  title?: string;
  pages: number;
  /** The annotations still open. */
  openComments: number;
  source?: MockupSource;
  /** When `spec.json` last changed, ISO 8601. */
  updatedAt: string;
}

/** One row of `GET /api/mockup`: a draft, or a mockup built into real pages. */
export type MockupSummary = MockupSummaryBase &
  (
    | { status: "draft" }
    | { status: "built"; builtAt: string; builtPages: MockupBuiltPage[] }
  );

export type MockupWidth = "desktop" | "mobile";

export type MockupDataMode = "real" | "sample";

export const MOCKUP_DATA_MODES: readonly MockupDataMode[] = ["real", "sample"];

export function isMockupDataMode(
  value: string | undefined,
): value is MockupDataMode {
  return MOCKUP_DATA_MODES.some((mode) => mode === value);
}

/** The editor's mode: leave notes for the AI, or edit the spec yourself. */
export type MockupMode = "comment" | "edit";

export const MOCKUP_MODES: readonly MockupMode[] = ["comment", "edit"];

export function isMockupMode(value: string | undefined): value is MockupMode {
  return MOCKUP_MODES.some((mode) => mode === value);
}

export const MOCKUP_WIDTH_OPTIONS: readonly MockupWidth[] = [
  "desktop",
  "mobile",
];

/** The frame width, in CSS pixels, of each {@link MockupWidth}. */
export const MOCKUP_WIDTHS: Record<MockupWidth, number> = {
  desktop: 1280,
  mobile: 390,
};

export const MOCKUP_LIST_ENDPOINT = "/api/mockup";

/** Event of the state stream carrying a {@link MockupState}. */
export const MOCKUP_STATE_EVENT = "state";

/** Event of the state stream carrying `{ annotations }`. */
export const MOCKUP_ANNOTATIONS_EVENT = "annotations";

/** The path of a mockup's API, `suffix` included (`/events`, `/annotations/<id>`). */
export function mockupEndpoint(name: string, suffix = ""): string {
  return `${MOCKUP_LIST_ENDPOINT}/${encodeURIComponent(name)}${suffix}`;
}

export function isMockupWidth(value: string | undefined): value is MockupWidth {
  return value !== undefined && Object.hasOwn(MOCKUP_WIDTHS, value);
}

/** The first value of a query parameter, `undefined` when it is absent or empty. */
export function readQueryValue(
  value: Parameters<typeof isString>[0] | readonly unknown[],
): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return isString(first) && first !== "" ? first : undefined;
}

function isRecord(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function isOptionalString(value: Parameters<typeof isString>[0]): boolean {
  return value === undefined || isString(value);
}

function isIssue(value: Parameters<typeof isObject>[0]): value is MockupIssue {
  return isRecord(value) && isString(value.path) && isString(value.message);
}

function isPageState(
  value: Parameters<typeof isObject>[0],
): value is MockupPageState {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isRecord(value.options) &&
    Array.isArray(value.tree) &&
    isPreviewTree(value.tree) &&
    (value.realTree === undefined ||
      (Array.isArray(value.realTree) && isPreviewTree(value.realTree))) &&
    (value.livePage === undefined ||
      (isRecord(value.livePage) && isString(value.livePage.ref))) &&
    isRecord(value.paths) &&
    Object.values(value.paths).every((pointer) => isString(pointer))
  );
}

function isMockupState(
  value: Parameters<typeof isObject>[0],
): value is MockupState {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isOptionalString(value.title) &&
    isNumber(value.revision) &&
    Array.isArray(value.pages) &&
    value.pages.every(isPageState) &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssue)
  );
}

/** The state a stream event carries, or undefined when the data is not one. */
export function parseMockupState(
  value: Parameters<typeof isObject>[0],
): MockupState | undefined {
  return isMockupState(value) ? value : undefined;
}

function isAnchor(
  value: Parameters<typeof isObject>[0],
): value is MockupBlockAnchor {
  return (
    value === undefined ||
    (isRecord(value) &&
      isString(value.block) &&
      Array.isArray(value.steps) &&
      value.steps.every((step) => isString(step)) &&
      isOptionalString(value.page))
  );
}

function isAnnotation(
  value: Parameters<typeof isObject>[0],
): value is MockupAnnotation {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isAnchor(value.anchor) &&
    isOptionalString(value.page) &&
    isOptionalString(value.path) &&
    isString(value.text) &&
    (value.status === "open" || value.status === "resolved") &&
    isString(value.createdAt) &&
    isOptionalString(value.resolvedAt)
  );
}

/** The annotation a `POST` or `PATCH` answers, or undefined when the answer is not one. */
export function parseAnnotation(
  value: Parameters<typeof isObject>[0],
): MockupAnnotation | undefined {
  return isAnnotation(value) ? value : undefined;
}

/** The annotations of an `{ annotations }` answer or event, or undefined when it is not one. */
export function parseAnnotations(
  value: Parameters<typeof isObject>[0],
): MockupAnnotation[] | undefined {
  if (!isRecord(value)) return undefined;
  const { annotations } = value;
  return Array.isArray(annotations) && annotations.every(isAnnotation)
    ? annotations
    : undefined;
}

function isSource(
  value: Parameters<typeof isString>[0],
): value is MockupSource {
  return MOCKUP_SOURCES.some((source) => source === value);
}

/**
 * A path of the dashboard, by the backend's `RELATIVE_ROUTE_PATTERN`: one
 * leading `/`, no host (`//host`, `/\host`), no whitespace, and no control
 * character, which a URL parser drops: `/<tab>/host` reads `//host`.
 */
export function isDashboardPath(
  value: Parameters<typeof isString>[0],
): boolean {
  return isString(value) && /^\/(?![/\\])[^\s\p{Cc}]*$/u.test(value);
}

function isBuiltPage(
  value: Parameters<typeof isObject>[0],
): value is MockupBuiltPage {
  return (
    isRecord(value) &&
    isDashboardPath(value.path) &&
    isString(value.title) &&
    typeof value.changed === "boolean" &&
    (value.pageId === undefined || isString(value.pageId))
  );
}

function isSummaryBase(
  value: Parameters<typeof isObject>[0],
): value is Record<string, unknown> & MockupSummaryBase {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isOptionalString(value.title) &&
    isNumber(value.pages) &&
    isNumber(value.openComments) &&
    (value.source === undefined || isSource(value.source)) &&
    isString(value.updatedAt)
  );
}

function isSummary(
  value: Parameters<typeof isObject>[0],
): value is MockupSummary {
  if (!isSummaryBase(value)) return false;
  if (value.status === "draft") return true;
  return (
    value.status === "built" &&
    isString(value.builtAt) &&
    Array.isArray(value.builtPages) &&
    value.builtPages.every(isBuiltPage)
  );
}

/** The summary a row of `GET /api/mockup` is, or undefined when the row is not one. */
export function parseMockupSummary(
  value: Parameters<typeof isObject>[0],
): MockupSummary | undefined {
  return isSummary(value) ? value : undefined;
}

/** The mockups of a `GET /api/mockup` answer, or undefined when it is not one. */
export function parseMockupList(
  value: Parameters<typeof isObject>[0],
): MockupSummary[] | undefined {
  if (!isRecord(value)) return undefined;
  const { results } = value;
  return Array.isArray(results) && results.every(isSummary)
    ? results
    : undefined;
}

/**
 * The spec JSON pointer of the node the preview calls `layoutPath`, or
 * undefined when the page's tree has no such node (a stale selection, or a
 * node a sketch or a notice replaced).
 */
export function specPointerFor(
  page: Pick<MockupPageState, "paths">,
  layoutPath: string,
): string | undefined {
  return Object.hasOwn(page.paths, layoutPath)
    ? page.paths[layoutPath]
    : undefined;
}

/** The layout path the preview gives the node at spec `pointer`, or undefined when it draws none. */
export function layoutPathFor(
  page: Pick<MockupPageState, "paths">,
  pointer: string,
): string | undefined {
  return Object.entries(page.paths).find(([, at]) => at === pointer)?.[0];
}

const ROOT_LAYOUT_PREFIX = "block-";

function nodeAt(
  page: Pick<MockupPageState, "tree">,
  layoutPath: string,
): PreviewNode | undefined {
  const [root, ...steps] = layoutPath.split(".");
  if (!root?.startsWith(ROOT_LAYOUT_PREFIX)) return undefined;
  let node: PreviewNode | undefined =
    page.tree[Number(root.slice(ROOT_LAYOUT_PREFIX.length))];
  for (const step of steps) {
    node = node?.children?.find(
      (child, index) => (child.id ?? String(index)) === step,
    );
  }
  return node;
}

/**
 * The compiled node the preview calls `layoutPath`, as JSON text: root `i` is
 * `block-<i>`, then each child by its id or index. Undefined when the tree
 * has none. Two reads that differ mean the node at that place changed.
 */
export function nodeTextAt(
  page: Pick<MockupPageState, "tree">,
  layoutPath: string,
): string | undefined {
  const node = nodeAt(page, layoutPath);
  return node ? JSON.stringify(node) : undefined;
}

/**
 * The name of the block a note is about, as the preview resolves it: its
 * `type`, else its `componentName`. Undefined when the note has no location
 * or the pages draw no node there.
 */
export function annotationBlockName(
  pages: readonly MockupPageState[],
  annotation: Pick<MockupAnnotation, "page" | "path">,
): string | undefined {
  const { page: pageId, path } = annotation;
  const page = pages.find((entry) => entry.id === pageId);
  const layoutPath =
    page && path !== undefined ? layoutPathFor(page, path) : undefined;
  const node = page && layoutPath ? nodeAt(page, layoutPath) : undefined;
  return node?.type ?? node?.componentName;
}

/** `annotation` with the answer of a `PATCH` or `POST` merged into `list`, newest last. */
export function upsertAnnotation(
  list: readonly MockupAnnotation[],
  annotation: MockupAnnotation,
): MockupAnnotation[] {
  const exists = list.some((entry) => entry.id === annotation.id);
  return exists
    ? list.map((entry) => (entry.id === annotation.id ? annotation : entry))
    : [...list, annotation];
}
