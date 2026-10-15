import { getCurrentScope, onScopeDispose } from "vue";

type Refresh = () => Promise<void>;

// Browser only: a page refresh is a browser event, and a server render reads
// once. A tab runs one application at a time, so one set serves it.
const reads = new Set<Refresh>();

/**
 * Has `refresh` run on each refresh of the page's blocks, for as long as the
 * caller's scope lives (`useApiData`'s `refreshOnPageRefresh`). Nothing on
 * the server.
 */
export function followPageRefresh(refresh: Refresh): void {
  if (typeof window === "undefined" || !getCurrentScope()) return;
  reads.add(refresh);
  onScopeDispose(() => reads.delete(refresh));
}

/**
 * Reads again every `useApiData` that follows the page's refreshes. dms-ui
 * calls it when the page refreshes its blocks, through the page's live gate.
 *
 * @internal
 */
export function refreshPageReads(): Promise<void> {
  return Promise.all([...reads].map((refresh) => refresh())).then(() => {});
}
