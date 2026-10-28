import { createHash } from "node:crypto";
import type { PageHeaderButtonSerialized } from "@antelopejs/interface-dms/base/internal/layouts";

/** The quick actions served to one permission set, keyed `category:id`. */
export interface ServedQuickActions {
  actions: Record<string, { id: string }>;
}

/** Header actions of a served page layout (`DefaultLayout({ headerActions })`). */
export function readHeaderActions(
  layout: { options?: unknown } | undefined,
): PageHeaderButtonSerialized[] {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Resolved layout options are opaque; inference and PageHeaderButtonSerialized cannot prove a custom layout follows DefaultLayout's headerActions convention, which this extraction already assumes without checking.
  const options = layout?.options as
    | { headerActions?: PageHeaderButtonSerialized[] }
    | undefined;
  return options?.headerActions ?? [];
}

function servesQuickAction(served: ServedQuickActions, key: string): boolean {
  return (
    key in served.actions ||
    Object.values(served.actions).some((action) => action.id === key)
  );
}

/** What one permission set is served on a page, for its header actions. */
export interface HeaderActionAccess {
  headerActions: PageHeaderButtonSerialized[];
  quickActions: ServedQuickActions;
}

function headerActionShown(
  action: PageHeaderButtonSerialized,
  access: HeaderActionAccess,
): boolean {
  if (!access.headerActions.some((served) => served.id === action.id)) {
    return false;
  }

  if (action.target?.type === "quickAction") {
    return servesQuickAction(access.quickActions, action.target.id);
  }
  return true;
}

/**
 * Ids of the header actions the viewer is shown and the previewed set would
 * not be: left out by their `permission` (a component's button, by the
 * component's), or running a quick action the set is not served.
 */
export function findHeaderActionsHiddenByPreview(
  viewer: HeaderActionAccess,
  preview: HeaderActionAccess,
): string[] {
  return viewer.headerActions
    .filter(
      (action) =>
        headerActionShown(action, viewer) &&
        !headerActionShown(action, preview),
    )
    .map((action) => action.id);
}

/** Keys of the quick actions the viewer is served and the previewed set is not. */
export function findQuickActionsHiddenByPreview(
  viewer: ServedQuickActions,
  preview: ServedQuickActions,
): string[] {
  return Object.keys(viewer.actions).filter((key) => !(key in preview.actions));
}

/**
 * One menu entry the viewer reaches, as the preview aggregates it: its
 * children are the entries the viewer reaches under it (registered and
 * dynamic alike).
 */
export interface PreviewMenuNode {
  fullId: string;
  /** Whether the entry opens a page of its own, rather than only grouping others. */
  opensPage: boolean;
  children: PreviewMenuNode[];
}

/** How much of an entry the previewed set keeps. */
export type PreviewEntryAccess = "full" | "partial" | "denied";

/** The entries a preview draws locked (`hidden`) or partially locked (`partial`). */
export interface PreviewMenuStates {
  hidden: string[];
  partial: string[];
}

/** What the menu aggregation reads besides the menu itself. */
interface PreviewMenuReadings {
  denied: ReadonlySet<string>;
  losesInside: ReadonlySet<string>;
  universal: ReadonlySet<string>;
}

function aggregateNode(
  node: PreviewMenuNode,
  readings: PreviewMenuReadings,
  states: Map<string, PreviewEntryAccess>,
): PreviewEntryAccess {
  const { denied, losesInside, universal } = readings;
  const children = node.children.map((child) =>
    aggregateNode(child, readings, states),
  );
  let access: PreviewEntryAccess;
  if (denied.has(node.fullId)) {
    access = "denied";
  } else if (node.opensPage && universal.has(node.fullId)) {
    access = losesInside.has(node.fullId) ? "partial" : "full";
  } else if (
    !node.opensPage &&
    children.length > 0 &&
    children.every((child) => child === "denied")
  ) {
    access = "denied";
  } else if (
    losesInside.has(node.fullId) ||
    children.some((child) => child !== "full")
  ) {
    access = "partial";
  } else {
    access = "full";
  }
  states.set(node.fullId, access);
  return access;
}

/**
 * What a previewed set keeps of each menu entry the viewer reaches:
 * - `denied` (drawn red): the set cannot open the entry, or the entry only
 *   groups others and the set can open none of them;
 * - `partial` (drawn orange): the set opens the entry but loses something in
 *   it — a block or an action of its page (`losesInside`), or one of its
 *   entries, refused or partial itself;
 * - `full`: the set keeps everything the viewer has there.
 *
 * A page every member opens whatever their role (`defaultGranted`: the
 * settings overview) is judged on its own page only: no role changes it, so
 * an entry refused under it never draws it partial.
 *
 * @param denied Entries the set cannot open, as access alone decides.
 * @param losesInside Pages (and dynamic entries, by their target page) the set
 *   opens with fewer blocks or actions than the viewer.
 * @param universal Entries a set holding nothing still opens.
 */
export function aggregatePreviewMenu(
  nodes: PreviewMenuNode[],
  denied: ReadonlySet<string>,
  losesInside: ReadonlySet<string>,
  universal: ReadonlySet<string> = new Set(),
): PreviewMenuStates {
  const states = new Map<string, PreviewEntryAccess>();
  const readings = { denied, losesInside, universal };
  for (const node of nodes) aggregateNode(node, readings, states);
  const hidden = new Set(denied);
  for (const [fullId, access] of states) {
    if (access === "denied") hidden.add(fullId);
  }
  const partial = [...states]
    .filter(([fullId, access]) => access === "partial" && !hidden.has(fullId))
    .map(([fullId]) => fullId);
  return { hidden: [...hidden], partial };
}

/** What identifies the answers of a preview: who previews, with which sets. */
export interface PreviewCacheScope {
  tenantId: string;
  userId: string;
  /** Bumped whenever the registered surfaces change. */
  structureVersion: number;
  /** The viewer's effective permissions. */
  real: Iterable<string>;
  /** The previewed set. */
  preview: Iterable<string>;
}

const KEY_PART_SEPARATOR = "\u0000";
const KEY_ID_SEPARATOR = "\n";

function sortedIds(ids: Iterable<string>): string {
  return [...new Set(ids)].sort().join(KEY_ID_SEPARATOR);
}

/** Key of a preview scope: the same viewer and sets give the same key, in any order. */
export function previewCacheKey(scope: PreviewCacheScope): string {
  return createHash("sha256")
    .update(
      [
        scope.tenantId,
        scope.userId,
        String(scope.structureVersion),
        sortedIds(scope.real),
        sortedIds(scope.preview),
      ].join(KEY_PART_SEPARATOR),
    )
    .digest("hex");
}

interface PreviewCacheEntry<V> {
  expiresAt: number;
  pages: Map<string, Promise<V>>;
}

/**
 * Per preview scope, an answer per page — whether the previewed set loses
 * anything there, or the layout the viewer is served — so a preview tab
 * moving from page to page, or asking again for the same edits, does not
 * resolve every page layout again. Entries live `ttlMs`, and only the
 * `maxScopes` most recent scopes are kept.
 */
export class PreviewScopeCache<V> {
  private readonly entries = new Map<string, PreviewCacheEntry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxScopes: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** The answers of one scope, by page `fullId`; filled by the caller. */
  pagesFor(key: string): Map<string, Promise<V>> {
    const time = this.now();
    for (const [scope, entry] of this.entries) {
      if (entry.expiresAt <= time) this.entries.delete(scope);
    }
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.pages;
    }
    const pages = new Map<string, Promise<V>>();
    this.entries.set(key, { expiresAt: time + this.ttlMs, pages });
    while (this.entries.size > this.maxScopes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return pages;
  }

  clear(): void {
    this.entries.clear();
  }
}
