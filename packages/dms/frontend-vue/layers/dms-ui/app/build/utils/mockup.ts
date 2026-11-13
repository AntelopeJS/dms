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

export interface MockupPageState {
  id: string;
  title: string;
  options: MockupPageOptions;
  /** What `DmsBlockPreview` draws: fixtures resolved, sketch nodes passed through. */
  tree: PreviewNode[];
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

/** The block a note is about: the node whose id is `block`, then the children whose ids are `steps`. */
export interface MockupBlockAnchor {
  block: string;
  steps: string[];
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

export interface MockupSummary {
  name: string;
  title?: string;
  pages: number;
}

export type MockupWidth = "desktop" | "mobile";

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
      value.steps.every((step) => isString(step)))
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

function isSummary(
  value: Parameters<typeof isObject>[0],
): value is MockupSummary {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isOptionalString(value.title) &&
    isNumber(value.pages)
  );
}

/** The mockups of a `GET /api/mockup` answer, or undefined when it is not one. */
export function parseMockupList(
  value: Parameters<typeof isObject>[0],
): MockupSummary[] | undefined {
  if (!isRecord(value)) return undefined;
  const { mockups } = value;
  return Array.isArray(mockups) && mockups.every(isSummary)
    ? mockups
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
