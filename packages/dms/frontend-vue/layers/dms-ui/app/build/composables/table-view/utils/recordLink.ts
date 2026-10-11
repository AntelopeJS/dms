import type { CustomRowAction } from "../../../../types/row-action";
import { readTableUrlKey, type TableUrlScope } from "./views";

/** Query key of the row a `deepLink` action has open. */
export const RECORD_URL_KEY = "record";

/** The key this table writes the open row under: short on a sole table. */
export function recordUrlKey(scope: TableUrlScope): string {
  return scope.isSoleTableView || !scope.tableId
    ? RECORD_URL_KEY
    : `${scope.tableId}.${RECORD_URL_KEY}`;
}

/** The row the URL names for this table, if any. */
export function readRecordId(
  query: Record<string, unknown>,
  scope: TableUrlScope,
): string | undefined {
  return readTableUrlKey(query, scope, RECORD_URL_KEY).value;
}

/**
 * Writes (or, without an id, removes) the open row in the browser's URL in
 * place: no visit, no history entry, the link and a reload open it again.
 * Returns what it wrote, for {@link clearWrittenRecord}.
 */
export function writeRecordId(
  scope: TableUrlScope,
  id?: string,
): WrittenRecord | undefined {
  if (typeof window === "undefined") return undefined;
  const url = new URL(window.location.href);
  const key = recordUrlKey(scope);
  if (id) url.searchParams.set(key, id);
  else url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", url);
  return id ? { pathname: url.pathname, key, id } : undefined;
}

/**
 * Whether an action keeps the row it opens in the URL: a side panel does
 * unless its target or the action sets `deepLink: false`, a drawer or a modal
 * only with the action's `deepLink: true`.
 */
export function isDeepLinkAction(action: CustomRowAction): boolean {
  if (action.target.type !== "sidePanel") return !!action.deepLink;
  return (action.deepLink ?? action.target.deepLink) !== false;
}

/** The row a table wrote in the URL, and the page it wrote it on. */
export interface WrittenRecord {
  pathname: string;
  key: string;
  id: string;
}

/**
 * Removes the row a table wrote in the URL, only while the URL still holds
 * it: a container closing as the user leaves the page must not erase the
 * `?record=` of the page reached.
 */
export function clearWrittenRecord(written: WrittenRecord | undefined): void {
  if (typeof window === "undefined" || !written) return;
  const url = new URL(window.location.href);
  if (url.pathname !== written.pathname) return;
  if (url.searchParams.get(written.key) !== written.id) return;
  url.searchParams.delete(written.key);
  window.history.replaceState(window.history.state, "", url);
}

/** Where a deep link finds its row: among the rows listed, or by id. */
export interface DeepLinkedRowSource<T> {
  listed: T[] | undefined;
  idOf: (row: T) => string | undefined;
  /** Reads one row: a controller's `get` route, a source's `fetchRowUrl`. */
  getRow: (id: string) => Promise<T | undefined>;
}

/**
 * The row a deep link names: the listed one, else the one read by id — a row
 * beyond the first page. A row the route cannot answer (gone, a 404) opens
 * nothing.
 */
export async function resolveDeepLinkedRow<T>(
  id: string,
  source: DeepLinkedRowSource<T>,
): Promise<T | undefined> {
  const listed = source.listed?.find((row) => source.idOf(row) === id);
  if (listed) return listed;
  return source.getRow(id).catch(() => undefined);
}
