/**
 * Every form holding unsaved changes, wherever it is (a page, a drawer, a
 * modal, a settings panel), and the one confirmation asked before leaving
 * them: closing their container, navigating away, switching the tab they sit
 * in, going back in the browser or reloading the page.
 *
 * Plain TypeScript (no Vue context): `useUnsavedChanges` registers the forms
 * and hands over the dialog to show.
 */

/** Asks the user whether to throw the changes away; `true` to leave. */
export type DiscardPrompt = () => Promise<boolean>;

export interface UnsavedChangesSource {
  /** Whether the form currently holds unsaved changes. */
  isDirty: () => boolean;
  /** The drawer or modal it sits in: closing that container leaves it. */
  containerId?: string;
  /** Its root element: switching away from a tab panel leaves what it holds. */
  element?: () => Element | null | undefined;
}

export interface UnsavedChangesEntry extends UnsavedChangesSource {
  /** The dialog this form asks with (every form asks the same one). */
  prompt: DiscardPrompt;
  /**
   * The user chose to discard its changes: it no longer holds anyone back
   * (a closing drawer after a confirmed navigation asks nothing more) until
   * it is clean again.
   */
  released: boolean;
}

/** Which forms a leave concerns; every form when left empty. */
export interface LeaveScope {
  /** The forms of one drawer or modal. */
  containerId?: string;
  /** The forms inside an element (a tab panel about to be hidden). */
  within?: Element | null;
  /** One form only. */
  entry?: UnsavedChangesEntry;
}

const entries = new Set<UnsavedChangesEntry>();
let pendingPrompt: Promise<boolean> | null = null;

function inScope(entry: UnsavedChangesEntry, scope: LeaveScope): boolean {
  if (scope.entry && scope.entry !== entry) return false;
  if (
    scope.containerId !== undefined &&
    entry.containerId !== scope.containerId
  )
    return false;
  if (scope.within !== undefined) {
    const element = entry.element?.();
    return !!element && !!scope.within?.contains(element);
  }
  return true;
}

/** Adds a form; returns the entry and the function removing it. */
export function registerUnsavedChanges(
  source: UnsavedChangesSource,
  prompt: DiscardPrompt,
): { entry: UnsavedChangesEntry; unregister: () => void } {
  const entry: UnsavedChangesEntry = { ...source, prompt, released: false };
  entries.add(entry);
  return { entry, unregister: () => entries.delete(entry) };
}

/** The forms of a scope still holding changes nobody chose to discard. */
export function pendingUnsavedChanges(
  scope: LeaveScope = {},
): UnsavedChangesEntry[] {
  return [...entries].filter(
    (entry) => !entry.released && entry.isDirty() && inScope(entry, scope),
  );
}

/** Whether leaving the scope would lose changes. */
export function hasUnsavedChanges(scope: LeaveScope = {}): boolean {
  return pendingUnsavedChanges(scope).length > 0;
}

/**
 * Asks once before leaving the forms of a scope: resolves `true` straight
 * away when none holds changes, else with the user's answer. A leave asked
 * while the dialog is already open (Escape on a drawer closing during a
 * navigation) waits for that same answer instead of opening a second one;
 * discarding releases the forms so nothing asks again on the way out.
 */
export async function confirmLeave(scope: LeaveScope = {}): Promise<boolean> {
  const dirty = pendingUnsavedChanges(scope);
  if (dirty.length === 0) return true;
  pendingPrompt ??= dirty[0]!.prompt().finally(() => {
    pendingPrompt = null;
  });
  const shouldLeave = await pendingPrompt;
  if (shouldLeave) {
    for (const entry of pendingUnsavedChanges(scope)) entry.released = true;
  }
  return shouldLeave;
}

/** Forgets every form (tests). */
export function resetUnsavedChanges(): void {
  entries.clear();
  pendingPrompt = null;
}

/** What the browser guards need from the app. */
export interface BrowserLeaveGuardsOptions {
  /** The path the page shows. */
  path: () => string;
  /** Runs a page visit again once the user chose to leave. */
  revisit: (href: string) => unknown;
}

/** The part of a router visit the guard reads (Inertia's `inertia:before`). */
interface PendingVisit {
  url?: URL;
  method?: string;
  prefetch?: boolean;
}

/** The part of a Navigation API `navigate` event the guard reads. */
interface TraverseEvent extends Event {
  navigationType?: string;
  cancelable: boolean;
  destination?: { url: string; key: string; sameDocument: boolean };
}

interface NavigationLike extends EventTarget {
  traverseTo: (key: string) => unknown;
}

let browserGuardsInstalled = false;
let currentPath: () => string = () => window.location.pathname;
let revisit: (href: string) => unknown = (href) => {
  window.location.href = href;
};
// The user chose to leave: the history step run again goes through.
let isTraversing = false;

/**
 * Whether a router visit leaves the page holding unsaved changes: a page
 * visit to another path. A prefetch on hover, a background refresh of the
 * same page or a request sending data leaves nothing.
 */
export function isLeavingVisit(
  visit: PendingVisit | undefined,
  path: string,
): visit is PendingVisit & { url: URL } {
  if (!visit?.url || visit.prefetch) return false;
  if (visit.method && visit.method.toLowerCase() !== "get") return false;
  return visit.url.pathname !== path;
}

/**
 * The ways out the app's own navigation guard never sees, installed once:
 * a link the router follows directly (`inertia:before`) is held and run again
 * once the user chose to leave; the Back and Forward buttons are held the
 * same way (the Navigation API's `navigate` event, the only one that comes
 * before the router has swapped the page); reloading or closing the tab gets
 * the native prompt (browsers show their own text there).
 */
export function installBrowserLeaveGuards(
  options: BrowserLeaveGuardsOptions,
): void {
  currentPath = options.path;
  revisit = options.revisit;
  if (browserGuardsInstalled || typeof window === "undefined") return;
  browserGuardsInstalled = true;

  document.addEventListener("inertia:before", (event) => {
    const visit = (event as CustomEvent<{ visit?: PendingVisit }>).detail
      ?.visit;
    if (!isLeavingVisit(visit, currentPath())) return;
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    const { pathname, search, hash } = visit.url;
    void confirmLeave().then((shouldLeave) => {
      if (shouldLeave) revisit(`${pathname}${search}${hash}`);
    });
  });

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    // Older browsers only prompt when a value is set.
    event.returnValue = "";
  });

  const navigation = (window as unknown as { navigation?: NavigationLike })
    .navigation;
  navigation?.addEventListener("navigate", (event) => {
    const traverse = event as TraverseEvent;
    const destination = traverse.destination;
    if (traverse.navigationType !== "traverse" || !destination) return;
    if (isTraversing) {
      isTraversing = false;
      return;
    }
    // Another document unloads this one: `beforeunload` asks. A hash or
    // query change keeps the page and its forms.
    if (!destination.sameDocument || !traverse.cancelable) return;
    if (new URL(destination.url).pathname === currentPath()) return;
    if (!hasUnsavedChanges()) return;
    traverse.preventDefault();
    void confirmLeave().then((shouldLeave) => {
      if (!shouldLeave) return;
      isTraversing = true;
      navigation.traverseTo(destination.key);
    });
  });
}
