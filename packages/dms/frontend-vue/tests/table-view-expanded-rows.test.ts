import { describe, expect, it } from "vitest";
import {
  defaultExpandedRows,
  expandedRowsOnListing,
  type ExpandedRowsState,
  keepListedRows,
  nextExpandedRows,
} from "../layers/dms-ui/app/build/composables/table-view/utils/expandedRows";

const ROWS = ["a", "b", "c"];

describe("TableView expandable rows", () => {
  it("opens nothing, the first row or every row on arrival", () => {
    expect(defaultExpandedRows(ROWS)).toEqual({});
    expect(defaultExpandedRows(ROWS, "first")).toEqual({ a: true });
    expect(defaultExpandedRows(ROWS, "all")).toEqual({
      a: true,
      b: true,
      c: true,
    });
    expect(defaultExpandedRows([], "all")).toEqual({});
  });

  it("opens only the first row for 'all' in single mode", () => {
    expect(defaultExpandedRows(ROWS, "all", true)).toEqual({ a: true });
  });

  it("keeps several rows open, and drops closed ones", () => {
    expect(nextExpandedRows({ a: true }, { a: true, b: true }, ROWS)).toEqual({
      a: true,
      b: true,
    });
    expect(
      nextExpandedRows({ a: true, b: true }, { a: false, b: true }, ROWS),
    ).toEqual({ b: true });
  });

  it("turns TanStack's 'all rows' into the listed ids", () => {
    expect(nextExpandedRows({}, true, ROWS)).toEqual({
      a: true,
      b: true,
      c: true,
    });
  });

  it("keeps only the row opened last in single mode", () => {
    expect(
      nextExpandedRows({ a: true }, { a: true, c: true }, ROWS, true),
    ).toEqual({ c: true });
    expect(nextExpandedRows({ a: true }, {}, ROWS, true)).toEqual({});
    expect(nextExpandedRows({}, true, ROWS, true)).toEqual({ c: true });
  });

  it("forgets open rows that are no longer listed", () => {
    expect(keepListedRows({ a: true, z: true }, ROWS)).toEqual({ a: true });
  });
});

describe("TableView expandable rows on listing", () => {
  const PAGE_1 = JSON.stringify([{ page: 1 }, {}]);
  const PAGE_2 = JSON.stringify([{ page: 2 }, {}]);

  it("waits for the first rows before opening the default ones", () => {
    let state: ExpandedRowsState = { expanded: {} };
    state = expandedRowsOnListing(state, undefined, PAGE_1, "first");
    expect(state).toEqual({ expanded: {} });
    state = expandedRowsOnListing(state, ROWS, PAGE_1, "first");
    expect(state.expanded).toEqual({ a: true });

    const all = expandedRowsOnListing(
      expandedRowsOnListing({ expanded: {} }, undefined, PAGE_1, "all"),
      ROWS,
      PAGE_1,
      "all",
    );
    expect(all.expanded).toEqual({ a: true, b: true, c: true });
  });

  it("keeps what the user opened on a refresh of the same set", () => {
    let state = expandedRowsOnListing({ expanded: {} }, ROWS, PAGE_1, "first");
    state = { ...state, expanded: { b: true } };
    state = expandedRowsOnListing(state, ["b", "c"], PAGE_1, "first");
    expect(state.expanded).toEqual({ b: true });
    state = expandedRowsOnListing(state, ["c"], PAGE_1, "first");
    expect(state.expanded).toEqual({});
  });

  it("opens the default again on a newly listed set, once its rows arrived", () => {
    let state = expandedRowsOnListing({ expanded: {} }, ROWS, PAGE_1, "first");
    state = { ...state, expanded: { c: true } };
    state = expandedRowsOnListing(state, undefined, PAGE_2, "first");
    expect(state.expanded).toEqual({ c: true });
    state = expandedRowsOnListing(state, ["d", "e"], PAGE_2, "first");
    expect(state.expanded).toEqual({ d: true });
  });

  it("spends the default on a set listed empty", () => {
    let state = expandedRowsOnListing({ expanded: {} }, [], PAGE_1, "first");
    expect(state).toEqual({ expanded: {}, listedKey: PAGE_1 });
    state = expandedRowsOnListing(state, ["a"], PAGE_1, "first");
    expect(state.expanded).toEqual({});
  });
});
