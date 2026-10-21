import { describe, expect, it } from "vitest";
import {
  defaultExpandedRows,
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
