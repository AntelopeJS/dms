/** Open rows of an expandable table, by row id. */
export type ExpandedRowMap = Record<string, boolean>;

/** Which rows open on arrival (backend `expandable.defaultExpanded`). */
export type ExpandedDefault = "none" | "first" | "all";

/**
 * The rows a freshly listed set opens with: none, the first one, or all of
 * them (only the first in single mode).
 */
export function defaultExpandedRows(
  rowIds: string[],
  mode: ExpandedDefault = "none",
  single = false,
): ExpandedRowMap {
  if (mode === "none" || rowIds.length === 0) return {};
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The exported ExpandedRowMap contract permits boolean-valued entries. Retain that existing caller contract instead of narrowing it to branch-specific known keys or values.
  if (mode === "first" || single) return { [rowIds[0]!]: true };
  return Object.fromEntries(rowIds.map((id) => [id, true]));
}

/**
 * The open rows after a toggle. TanStack hands either a map or `true` ("all
 * rows"); `true` becomes an explicit map of the listed rows. Single mode keeps
 * only the row opened last.
 */
export function nextExpandedRows(
  previous: ExpandedRowMap,
  next: ExpandedRowMap | true,
  rowIds: string[],
  single = false,
): ExpandedRowMap {
  const nextMap: ExpandedRowMap =
    next === true
      ? Object.fromEntries(rowIds.map((id) => [id, true]))
      : Object.fromEntries(Object.entries(next).filter(([, open]) => open));
  if (!single) return nextMap;
  const opened = Object.keys(nextMap).filter((id) => !previous[id]);
  const kept = opened.at(-1) ?? Object.keys(nextMap).at(-1);
  return kept ? { [kept]: true } : {};
}

/** Open rows still listed after a refresh of the same set. */
export function keepListedRows(
  expanded: ExpandedRowMap,
  rowIds: string[],
): ExpandedRowMap {
  const listed = new Set(rowIds);
  return Object.fromEntries(
    Object.entries(expanded).filter(([id]) => listed.has(id)),
  );
}

/** A table's open rows, and the listed set (its query) they belong to. */
export interface ExpandedRowsState {
  expanded: ExpandedRowMap;
  listedKey?: string;
}

/**
 * The open rows once the listed rows change: a newly listed set (another
 * `listedKey`: page, filter, search, sort, tab, archive view) opens with
 * `defaultExpanded`; a refresh of the same set keeps what the user opened,
 * minus rows no longer listed. Rows that have not arrived yet (`undefined`,
 * the list still loading, as on a first load) list no set: the default waits
 * for them instead of being spent on an empty table.
 */
export function expandedRowsOnListing(
  state: ExpandedRowsState,
  rowIds: string[] | undefined,
  listedKey: string,
  mode?: ExpandedDefault,
  single?: boolean,
): ExpandedRowsState {
  if (!rowIds) return state;
  if (listedKey === state.listedKey) {
    return { listedKey, expanded: keepListedRows(state.expanded, rowIds) };
  }
  return { listedKey, expanded: defaultExpandedRows(rowIds, mode, single) };
}
