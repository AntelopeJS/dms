import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { RowLocation } from "../../actions/rowNavigation";

/** One window of the table's result, under its current query. */
export interface LocatedWindow {
  results: Data[];
  total: number;
}

export interface RowLocatorOptions {
  /**
   * Reads the rows from `offset`, `limit` of them, under the table's current
   * query; `limit: 0` reads every row (`wholeRead`). `null` while it cannot.
   */
  list: (offset: number, limit: number) => Promise<LocatedWindow | null>;
  rowIdKey: string;
  /**
   * The table pages the rows itself (a source answering every row): one read
   * holds them all.
   */
  isWholeRead?: () => boolean;
}

/** Rows read per window while looking for a row. */
export const LOCATE_WINDOW = 200;
/**
 * How far into the result a row is looked for: past it, a deep link opens
 * without a position rather than reading the table to its end.
 */
export const LOCATE_MAX_ROWS = 5_000;
const HALF_WINDOW = Math.floor(LOCATE_WINDOW / 2);
/** The row and one on each side. */
const NEIGHBOURHOOD = 3;

const idOf = (row: Data, rowIdKey: string): string =>
  String(get(row, rowIdKey));

/** The location of the row at `local` in `rows`, read from `offset`. */
function locationIn(
  window: LocatedWindow,
  offset: number,
  local: number,
): RowLocation {
  return {
    index: offset + local,
    total: Math.max(window.total, offset + local + 1),
    prev: window.results[local - 1],
    next: window.results[local + 1],
  };
}

/**
 * Finds a row among all the rows a table lists, by id, reading its result
 * a window at a time: a deep link to a row past the page loaded, or a row
 * live updates pushed out of it, gets its position and its neighbours in the
 * table's current order. Each window overlaps the previous one by a row, so a
 * row found has its neighbours with it; one at a window's edge has them read
 * around it.
 */
export function rowLocator(options: RowLocatorOptions) {
  const { list, rowIdKey } = options;
  const find = (window: LocatedWindow, id: string) =>
    window.results.findIndex((row) => idOf(row, rowIdKey) === id);

  const withNeighbours = async (
    location: RowLocation,
  ): Promise<RowLocation> => {
    const lacksPrev = !location.prev && location.index > 0;
    const lacksNext = !location.next && location.index < location.total - 1;
    if (!lacksPrev && !lacksNext) return location;
    const offset = Math.max(0, location.index - 1);
    const around = await list(offset, NEIGHBOURHOOD);
    const local = around ? location.index - offset : -1;
    if (!around || !around.results[local]) return location;
    return { ...locationIn(around, offset, local), total: location.total };
  };

  return async (
    id: string,
    hint?: number,
  ): Promise<RowLocation | undefined> => {
    if (options.isWholeRead?.()) {
      const all = await list(0, 0);
      const local = all ? find(all, id) : -1;
      return all && local >= 0 ? locationIn(all, 0, local) : undefined;
    }
    // The window around where the row last stood first, then the result
    // from its start, until its end or the rows looked through run out.
    const starts = hint === undefined ? [] : [Math.max(0, hint - HALF_WINDOW)];
    let end = LOCATE_MAX_ROWS;
    for (let start = 0; start < end; start += LOCATE_WINDOW) starts.push(start);
    const read = new Set<number>();
    for (const start of starts) {
      if (read.has(start) || start >= end) continue;
      read.add(start);
      // One row before the window: its first row's previous.
      const offset = Math.max(0, start - 1);
      const window = await list(offset, LOCATE_WINDOW + (start > 0 ? 2 : 1));
      if (!window) return undefined;
      const local = find(window, id);
      if (local >= 0) return withNeighbours(locationIn(window, offset, local));
      end = Math.min(window.total, LOCATE_MAX_ROWS);
    }
    return undefined;
  };
}
