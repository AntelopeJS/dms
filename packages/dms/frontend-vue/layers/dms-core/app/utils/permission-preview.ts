// "Preview as role" (roles editor): the shapes the preview endpoint answers
// with, how a preview session travels from the editor tab to the preview tab,
// and which requests a preview tab may still send. Pure: no Vue, no window.

/** What a preview does to one block (`packages/dms/src/pages/settings/users/role-preview.ts`). */
export type PermissionPreviewBlock =
  | { state: "hidden" }
  | { state: "readonly" | "limited"; withheld: string[] };

export type PermissionPreviewState = PermissionPreviewBlock["state"];

/** Answer of `POST /settings/user/roles/preview`. */
export interface PermissionPreviewResult {
  page: { fullId: string; displayName: string; hidden: boolean } | null;
  /** Blocks keyed by layout path (component key, then child ids). */
  blocks: Record<string, PermissionPreviewBlock>;
  /** Menu entries (`fullId`) the viewer reaches and the role would not. */
  hiddenEntries: string[];
  /**
   * Menu entries (`fullId`) the role opens without all the viewer has there:
   * a page losing a block or an action, a group holding a refused or partial
   * entry. Absent from servers predating partial access.
   */
  partialEntries?: string[];
  /** Header actions of the page (ids) the viewer is shown and the role would not be. */
  hiddenHeaderActions?: string[];
  /** Quick actions (`category:id`) the viewer is served and the role would not be. */
  hiddenQuickActions?: string[];
  /** Role permissions outside the viewer's own access, left out of the preview. */
  outOfScope: number;
}

/** A role as the editor hands it to the preview tab, unsaved edits included. */
export interface PermissionPreviewSession {
  id: string;
  roleId: string | null;
  roleName: string;
  permissions: string[];
  /** Whether the editor holds edits that are not saved yet. */
  unsaved: boolean;
  /** Where "Exit preview" leads when the tab cannot close itself. */
  returnTo: string;
  updatedAt: number;
}

/** Endpoint the preview tab asks; a POST, so the request guard lets it through. */
export const PERMISSION_PREVIEW_ENDPOINT = "/settings/user/roles/preview";
/** Query parameter that hands a preview session to a new tab. */
export const PERMISSION_PREVIEW_QUERY_KEY = "dms-preview";
/** `localStorage` key prefix of the sessions the editor shares with its preview tabs. */
export const PERMISSION_PREVIEW_STORAGE_PREFIX = "dms-role-preview:";
/** `sessionStorage` key holding the preview of the current tab across reloads. */
export const PERMISSION_PREVIEW_TAB_KEY = "dms-role-preview-id";
/** Sessions older than this are dropped the next time a preview starts. */
export const PERMISSION_PREVIEW_TTL_MS = 86_400_000;
/**
 * Attribute the pre-paint script puts on `<html>` while a reloaded preview
 * tab has not applied its preview yet: the page content gives way to its
 * skeleton and the preview bar's place is held, so the full page never shows
 * before its veils.
 */
export const PERMISSION_PREVIEW_PENDING_ATTRIBUTE = "data-dms-role-preview";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Writes a preview tab still needs: the preview itself, keeping the session
// alive, realtime presence, and the batched counts tables read through a POST.
const SAFE_PATH_SUFFIXES = [
  PERMISSION_PREVIEW_ENDPOINT,
  "/api/_auth/session",
  "/auth/refresh",
  "/count/batch",
];
const SAFE_PATH_PREFIXES = ["/api/realtime/"];

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** A stored preview session, or `null` when the value is not one. */
export function parsePreviewSession(
  raw: string | null,
): PermissionPreviewSession | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<PermissionPreviewSession>;
  if (
    typeof session.id !== "string" ||
    typeof session.roleName !== "string" ||
    !isStringArray(session.permissions) ||
    typeof session.returnTo !== "string" ||
    typeof session.updatedAt !== "number"
  ) {
    return null;
  }
  return {
    id: session.id,
    roleId: typeof session.roleId === "string" ? session.roleId : null,
    roleName: session.roleName,
    permissions: session.permissions,
    unsaved: session.unsaved === true,
    returnTo: session.returnTo,
    updatedAt: session.updatedAt,
  };
}

export function isStalePreviewSession(
  session: Pick<PermissionPreviewSession, "updatedAt">,
  now: number,
): boolean {
  return now - session.updatedAt > PERMISSION_PREVIEW_TTL_MS;
}

function requestPathname(url: string): string {
  try {
    return new URL(url, "http://preview.invalid").pathname;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

/**
 * Whether a preview tab may send a request. A preview is read-only: anything
 * but a read is refused before it leaves the browser, except the few writes
 * the tab itself depends on.
 */
export function isPreviewSafeRequest(
  method: string | undefined,
  url: string,
): boolean {
  if (SAFE_METHODS.has((method ?? "GET").toUpperCase())) return true;
  const pathname = requestPathname(url);
  return (
    SAFE_PATH_SUFFIXES.some((suffix) => pathname.endsWith(suffix)) ||
    SAFE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** Layout path of a child block: its parent's path, then its own id. */
export function childLayoutPath(
  parentPath: string | undefined,
  childId: string,
): string | undefined {
  return parentPath ? `${parentPath}.${childId}` : undefined;
}

/** The preview state of a block, when the preview changes it. */
export function resolvePreviewBlock(
  result: PermissionPreviewResult | null | undefined,
  layoutPath: string | undefined,
): PermissionPreviewBlock | undefined {
  if (!result || !layoutPath) return undefined;
  return result.blocks[layoutPath];
}

/**
 * The veil of a block. Only a running preview veils anything: a normal session
 * is served what its permissions allow, with nothing locked or veiled.
 */
export function resolveActivePreviewBlock(
  active: boolean,
  result: PermissionPreviewResult | null | undefined,
  layoutPath: string | undefined,
): PermissionPreviewBlock | undefined {
  return active ? resolvePreviewBlock(result, layoutPath) : undefined;
}

/**
 * Whether a menu entry (registered page or category, label, dynamic entry or
 * footer link, by its `fullId`) is drawn locked: only while a preview runs,
 * for an entry the previewed role could not open.
 */
export function isPreviewEntryLocked(
  active: boolean,
  hiddenEntries: ReadonlySet<string>,
  fullId: string | undefined,
): boolean {
  return active && !!fullId && hiddenEntries.has(fullId);
}

/**
 * How a menu entry is drawn during a preview: `hidden` (red hatch and lock)
 * when the role could not open it, `partial` (orange hatch and lock) when it
 * opens it but loses a block, an action or an entry inside.
 */
export type PreviewEntryState = "hidden" | "partial";

/**
 * The preview state of a menu entry, settings item or overview card (by its
 * `fullId`). Only while a preview runs: a normal session never draws either.
 * A refused entry is never also partial.
 */
export function resolvePreviewEntryState(
  active: boolean,
  hiddenEntries: ReadonlySet<string>,
  partialEntries: ReadonlySet<string>,
  fullId: string | undefined,
): PreviewEntryState | null {
  if (!active || !fullId) return null;
  if (hiddenEntries.has(fullId)) return "hidden";
  if (partialEntries.has(fullId)) return "partial";
  return null;
}

/** The key a quick action is served under: `category:id`. */
export function quickActionKey(action: {
  id: string;
  category: { id: string };
}): string {
  return `${action.category.id}:${action.id}`;
}

/**
 * What `applyPreviewLocks` reads from a menu entry. Children are walked as
 * entries of the same kind (Nuxt UI types them as child items, which carry the
 * same `fullId` at runtime).
 */
export interface PreviewLockableEntry {
  fullId?: string;
  children?: readonly object[];
}

/**
 * Walk a menu (top-level groups of entries, their children at any depth) and
 * pass each entry the preview locks to `lock`. Labels, collapsed groups and
 * nested entries are all visited; an entry without a `fullId` is left as is.
 */
export function applyPreviewLocks<T extends PreviewLockableEntry>(
  items: readonly T[],
  isLocked: (fullId: string | undefined) => boolean,
  lock: (item: T) => T,
): T[] {
  return applyPreviewEntryStates(
    items,
    (fullId) => (isLocked(fullId) ? "hidden" : null),
    lock,
  );
}

/**
 * Walk a menu like `applyPreviewLocks`, passing each entry with a preview
 * state (refused or partial) to `decorate` along with that state.
 */
export function applyPreviewEntryStates<T extends PreviewLockableEntry>(
  items: readonly T[],
  stateOf: (fullId: string | undefined) => PreviewEntryState | null,
  decorate: (item: T, state: PreviewEntryState) => T,
): T[] {
  return items.map((item) => {
    const children = item.children
      ? applyPreviewEntryStates(
          item.children as readonly T[],
          stateOf,
          decorate,
        )
      : undefined;
    const visited = children ? { ...item, children } : item;
    const state = stateOf(item.fullId);
    return state ? decorate(visited, state) : visited;
  });
}

/** Query string of a preview tab's first URL. */
export function buildPreviewUrl(path: string, id: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${PERMISSION_PREVIEW_QUERY_KEY}=${encodeURIComponent(id)}`;
}

/** What the page picker of a preview reads from a site layout page. */
export interface PreviewablePageSource {
  hasAccess?: boolean;
  hidden?: boolean;
  publicAccess?: boolean;
  validation?: { requiredQueryParams?: string[] };
}

/**
 * Pages a preview can switch to: those the viewer opens without parameters.
 * Public pages (sign-in screens) and pages kept out of the menu are left out;
 * a page needing a route or query parameter is reached by navigating instead.
 */
export function listPreviewablePages<T extends PreviewablePageSource>(
  pages: Record<string, T>,
): Array<{ slug: string; page: T }> {
  return Object.entries(pages)
    .filter(
      ([slug, page]) =>
        page.hasAccess !== false &&
        page.hidden !== true &&
        page.publicAccess !== true &&
        !slug.includes(":") &&
        (page.validation?.requiredQueryParams?.length ?? 0) === 0,
    )
    .map(([slug, page]) => ({ slug, page }));
}
