import type { CustomRowAction } from "../../../../types/row-action";
import {
  readTableUrlKey,
  tableUrlKey,
  type TableUrlScope,
  writeTableUrlKey,
} from "./views";
import { readFetchNotFound } from "../../../utils/fetchNotFound";

/** Query key of the row a `deepLink` action has open. */
export const RECORD_URL_KEY = "record";

/** The key this table writes the open row under: short on a sole table. */
export function recordUrlKey(scope: TableUrlScope): string {
  return tableUrlKey(scope, RECORD_URL_KEY);
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
  const url = writeTableUrlKey(scope, RECORD_URL_KEY, id);
  if (!url || !id) return undefined;
  return { pathname: url.pathname, key: recordUrlKey(scope), id };
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
 * `?record=` of the page reached. Returns whether it removed it.
 */
export function clearWrittenRecord(
  written: WrittenRecord | undefined,
): boolean {
  if (typeof window === "undefined" || !written) return false;
  const url = new URL(window.location.href);
  if (url.pathname !== written.pathname) return false;
  if (url.searchParams.get(written.key) !== written.id) return false;
  url.searchParams.delete(written.key);
  window.history.replaceState(window.history.state, "", url);
  return true;
}

/** Where a deep link finds its row: among the rows listed, or by id. */
export interface DeepLinkedRowSource<T> {
  listed: T[] | undefined;
  idOf: (row: T) => string | undefined;
  /** Reads one row: a controller's `get` route, a source's `fetchRowUrl`. */
  getRow: (id: string) => Promise<T | undefined>;
}

/** What a deep link found: its row, or a route answering it is gone. */
export interface DeepLinkedRow<T> {
  row?: T;
  /** The route answered 404: the row the link names no longer exists. */
  isMissing: boolean;
  /**
   * The read failed for another reason (a refusal, the network, a server
   * error): the row may still exist, the link just could not be followed.
   */
  isFailed?: boolean;
}

/**
 * The row a deep link names: the listed one, else the one read by id — a row
 * beyond the first page. A route answering 404 marks it missing, any other
 * failure (a refusal, the network) marks it failed, and no route at all finds
 * nothing.
 */
export async function resolveDeepLinkedRow<T>(
  id: string,
  source: DeepLinkedRowSource<T>,
): Promise<DeepLinkedRow<T>> {
  const listed = source.listed?.find((row) => source.idOf(row) === id);
  if (listed) return { row: listed, isMissing: false };
  try {
    const row = await source.getRow(id);
    return { row: row ?? undefined, isMissing: false };
  } catch (error: unknown) {
    if (readFetchNotFound(error) !== null) return { isMissing: true };
    return { isMissing: false, isFailed: true };
  }
}

/**
 * What a table does with the row a deep link resolved to: open it, let a side
 * panel show its own "no longer available" state, tell the user the link led
 * nowhere (a drawer or a modal has no such state, and a table with no route to
 * read one row finds nothing either), or tell them the row could not be read
 * (a refusal, the network) without claiming it is gone.
 */
export type DeepLinkOutcome =
  | "open"
  | "missingPanel"
  | "notify"
  | "notifyFailed";

export function deepLinkOutcome(
  found: DeepLinkedRow<unknown>,
  action: CustomRowAction,
): DeepLinkOutcome {
  if (found.row) return "open";
  if (found.isFailed) return "notifyFailed";
  if (found.isMissing && action.target.type === "sidePanel")
    return "missingPanel";
  return "notify";
}
