/**
 * A row past the rows a table loaded (a deep link, a row live rows pushed
 * out) is found in its whole result, a window at a time: its position and
 * its neighbours in the table's order.
 */
import { describe, expect, it, vi } from "vitest";
import {
  LOCATE_MAX_ROWS,
  LOCATE_WINDOW,
  rowLocator,
} from "../layers/dms-ui/app/build/composables/table-view/utils/locateRow";

const rowsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ _id: `r${index}` }));

// A paginated route over `rows`; `limit: 0` reads every row.
function pagedList(rows: Data[]) {
  return vi.fn(async (offset: number, limit: number) => ({
    results: limit === 0 ? rows : rows.slice(offset, offset + limit),
    total: rows.length,
  }));
}

describe("locating a row in the table's result", () => {
  it("finds a row on a later page, with its neighbours", async () => {
    const rows = rowsOf(LOCATE_WINDOW * 3);
    const list = pagedList(rows);
    const locate = rowLocator({ list, rowIdKey: "_id" });
    const target = LOCATE_WINDOW + 28;
    expect(await locate(`r${target}`)).toEqual({
      index: target,
      total: rows.length,
      prev: rows[target - 1],
      next: rows[target + 1],
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("reads the window around where the row last stood first", async () => {
    const rows = rowsOf(LOCATE_WINDOW * 10);
    const list = pagedList(rows);
    const locate = rowLocator({ list, rowIdKey: "_id" });
    const target = LOCATE_WINDOW * 7 + 3;
    expect(await locate(`r${target}`, target - 2)).toMatchObject({
      index: target,
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("reads the neighbours of a row at a window's edge", async () => {
    const rows = rowsOf(LOCATE_WINDOW * 2);
    const list = pagedList(rows);
    const locate = rowLocator({ list, rowIdKey: "_id" });
    // The last row the first window reads: its next is in the second.
    const edge = LOCATE_WINDOW;
    expect(await locate(`r${edge}`)).toMatchObject({
      index: edge,
      prev: rows[edge - 1],
      next: rows[edge + 1],
    });
  });

  it("reads a table its browser pages at once", async () => {
    const rows = rowsOf(LOCATE_WINDOW * 3);
    const list = pagedList(rows);
    const locate = rowLocator({
      list,
      rowIdKey: "_id",
      isWholeRead: () => true,
    });
    expect(await locate("r250")).toMatchObject({ index: 250 });
    expect(list).toHaveBeenCalledExactlyOnceWith(0, 0);
  });

  it("gives up on a row not listed, or too far", async () => {
    const rows = rowsOf(LOCATE_MAX_ROWS + LOCATE_WINDOW);
    const list = pagedList(rows);
    const locate = rowLocator({ list, rowIdKey: "_id" });
    expect(await locate("gone")).toBeUndefined();
    expect(list).toHaveBeenCalledTimes(LOCATE_MAX_ROWS / LOCATE_WINDOW);
    expect(await locate(`r${LOCATE_MAX_ROWS + 1}`)).toBeUndefined();
  });

  it("answers nothing while the table cannot list", async () => {
    const locate = rowLocator({ list: async () => null, rowIdKey: "_id" });
    expect(await locate("r1")).toBeUndefined();
  });
});
