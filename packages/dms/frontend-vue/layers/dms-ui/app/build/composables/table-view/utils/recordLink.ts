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
 */
export function writeRecordId(scope: TableUrlScope, id?: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const key = recordUrlKey(scope);
  if (id) url.searchParams.set(key, id);
  else url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", url);
}
