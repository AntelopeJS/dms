import {
  isNumber,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import { isPreviewTree, type PreviewNode } from "./blockPreview";
import {
  isPreviewHeader,
  type PreviewHeaderAction,
} from "./blockPreviewMessages";

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

/** A section of the sidebar: a category of the dashboard's menu, its pages under its header. */
export interface MockupCategory {
  id: string;
  title: string;
  icon?: string;
}

/** The route of a sub-page: its parameter, and the row it shows while no link names one. */
export interface MockupPageRoute {
  param: string;
  sample?: string;
}

export interface MockupPageState {
  id: string;
  title: string;
  /** The id of the section the page is listed under; none for the default one. */
  category?: string;
  /** The sidebar leaves the page out: a detail or form page another page opens. */
  menu?: false;
  /** The page is one sketch, its whole `tree`, drawn inside the real page header and sidebar. */
  custom?: true;
  /** The mockup drew the page, not the spec: a table's generated form page, which no spec page holds, so nothing on it is edited or commented. */
  generated?: true;
  /** The page it is a sub-page of. */
  parent?: string;
  /** Its route parameter, when it shows one row of its parent's rows. */
  route?: MockupPageRoute;
  /** The pages it links to, in the spec's order. */
  links?: string[];
  /** The page header's icon, description and buttons, as the spec page writes them. */
  icon?: string;
  description?: string;
  headerActions?: PreviewHeaderAction[];
  options: MockupPageOptions;
  /** What `DmsBlockPreview` draws: fixtures resolved, sketch nodes passed through. */
  tree: PreviewNode[];
  /**
   * `tree` reading its live routes instead of fixtures, drawn with Real data
   * on. Present only when the page names live routes.
   */
  realTree?: PreviewNode[];
  livePage?: MockupLivePage;
  /** The live page a live reference page stands for, drawn itself, read-only. */
  live?: { ref: string };
  /** Spec JSON pointer of each node, keyed by the layout path the preview gives it. */
  paths: Record<string, string>;
}

/** A sketch the sidebar draws among its widgets in every page of the mockup. */
export interface MockupSidebarWidget {
  id: string;
  title?: string;
  /** Checked markup: empty when the spec's was refused. */
  html: string;
  css?: string;
  /** Frame height in CSS pixels. */
  height: number;
}

/** What the mockup adds to the sidebar beside its pages. */
export interface MockupSidebar {
  widgets: MockupSidebarWidget[];
}

export interface MockupState {
  name: string;
  title?: string;
  /** Moves on every successful read of the spec file. */
  revision: number;
  /** The sidebar's sections, in the menu's order; absent when the spec has none. */
  categories?: MockupCategory[];
  /** Absent when the spec adds nothing to the sidebar. */
  sidebar?: MockupSidebar;
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

/** What a note is on: a block, or the page `page` as a whole. */
export type MockupNoteAnchor = MockupBlockAnchor | { page: string };

/** Where a pin sits on its block or page: fractions of its box, from its top left corner. */
export interface MockupPinOffset {
  x: number;
  y: number;
}

/**
 * A reviewer's pin. `page` and `path` are where it is now: both on a block,
 * `page` alone on a page, neither when its block or page was removed.
 * `version` is the number of the history version it was pinned on, and
 * `resolvedVersion` the one it was resolved on.
 */
export interface MockupAnnotation {
  id: string;
  anchor: MockupNoteAnchor;
  offset: MockupPinOffset;
  page?: string;
  /** Spec JSON pointer of the note's block now. */
  path?: string;
  text: string;
  status: MockupAnnotationStatus;
  createdAt: string;
  resolvedAt?: string;
  version?: number;
  resolvedVersion?: number;
  /** The state of the sketch the note was pinned on; absent on its own `html` and on any other block. */
  state?: string;
}

/**
 * Where a pin is put: on the node at `path` of page `page`, or on the page
 * itself without `path`, and the state of the sketch drawn there.
 */
export interface MockupPinPlace {
  page: string;
  path?: string;
  offset: MockupPinOffset;
  state?: string;
}

/** What `POST /api/mockup/:name/annotations` takes. */
export interface MockupAnnotationDraft extends MockupPinPlace {
  text: string;
}

/** What `PATCH /api/mockup/:name/annotations/:id` takes. */
export interface MockupAnnotationPatch {
  status?: MockupAnnotationStatus;
  text?: string;
  place?: MockupPinPlace;
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
  value: string | null | undefined | readonly (string | null)[],
): string | undefined {
  const first = isString(value) ? value : value?.[0];
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

function isOptionalNumber(value: Parameters<typeof isNumber>[0]): boolean {
  return value === undefined || isNumber(value);
}

function isIssue(value: Parameters<typeof isObject>[0]): value is MockupIssue {
  return isRecord(value) && isString(value.path) && isString(value.message);
}

/** Whether `value` is a section of the sidebar. */
export function isMockupCategory(
  value: Parameters<typeof isObject>[0],
): value is MockupCategory {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isOptionalString(value.icon)
  );
}

function isPageRoute(
  value: Parameters<typeof isObject>[0],
): value is MockupPageRoute {
  return (
    isRecord(value) && isString(value.param) && isOptionalString(value.sample)
  );
}

/** Whether a page's place among the others reads right: out of the menu, under a parent, on a route, linking to pages. */
function hasPagePlace(value: Parameters<typeof isObject>[0]): boolean {
  return (
    isRecord(value) &&
    (value.menu === undefined || value.menu === false) &&
    (value.custom === undefined || value.custom === true) &&
    (value.generated === undefined || value.generated === true) &&
    isOptionalString(value.parent) &&
    (value.route === undefined || isPageRoute(value.route)) &&
    (value.links === undefined ||
      (Array.isArray(value.links) && value.links.every(isString)))
  );
}

function isPageState(
  value: Parameters<typeof isObject>[0],
): value is MockupPageState {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isOptionalString(value.category) &&
    hasPagePlace(value) &&
    isPreviewHeader({
      title: value.title,
      icon: value.icon,
      description: value.description,
      actions: value.headerActions,
    }) &&
    isRecord(value.options) &&
    Array.isArray(value.tree) &&
    isPreviewTree(value.tree) &&
    (value.realTree === undefined ||
      (Array.isArray(value.realTree) && isPreviewTree(value.realTree))) &&
    (value.livePage === undefined ||
      (isRecord(value.livePage) && isString(value.livePage.ref))) &&
    (value.live === undefined ||
      (isRecord(value.live) && isString(value.live.ref))) &&
    isRecord(value.paths) &&
    Object.values(value.paths).every((pointer) => isString(pointer))
  );
}

function isSidebarWidget(
  value: Parameters<typeof isObject>[0],
): value is MockupSidebarWidget {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isOptionalString(value.title) &&
    isString(value.html) &&
    isOptionalString(value.css) &&
    isNumber(value.height)
  );
}

function isSidebar(
  value: Parameters<typeof isObject>[0],
): value is MockupSidebar {
  return (
    isRecord(value) &&
    Array.isArray(value.widgets) &&
    value.widgets.every(isSidebarWidget)
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
    (value.categories === undefined ||
      (Array.isArray(value.categories) &&
        value.categories.every(isMockupCategory))) &&
    (value.sidebar === undefined || isSidebar(value.sidebar)) &&
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
): value is MockupNoteAnchor {
  if (!isRecord(value)) return false;
  if (value.block === undefined) return isString(value.page);
  return (
    isString(value.block) &&
    Array.isArray(value.steps) &&
    value.steps.every((step) => isString(step)) &&
    isOptionalString(value.page)
  );
}

function isFraction(value: Parameters<typeof isNumber>[0]): boolean {
  return isNumber(value) && value >= 0 && value <= 1;
}

function isOffset(
  value: Parameters<typeof isObject>[0],
): value is MockupPinOffset {
  return isRecord(value) && isFraction(value.x) && isFraction(value.y);
}

function isAnnotation(
  value: Parameters<typeof isObject>[0],
): value is MockupAnnotation {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isAnchor(value.anchor) &&
    isOffset(value.offset) &&
    isOptionalString(value.page) &&
    isOptionalString(value.path) &&
    isString(value.text) &&
    (value.status === "open" || value.status === "resolved") &&
    isString(value.createdAt) &&
    isOptionalString(value.resolvedAt) &&
    isOptionalNumber(value.version) &&
    isOptionalNumber(value.resolvedVersion) &&
    isOptionalString(value.state)
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
): value is MockupSummaryBase {
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
  if (!isRecord(value) || !isSummaryBase(value)) return false;
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
