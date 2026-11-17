/**
 * The Matrix grid's focus moved by the keys over its rows and columns: one
 * cell at a time, to the edges with Ctrl, a page at a time, the next
 * editable or empty cell, and where Enter goes after an edit.
 */
import { describe, expect, it } from "vitest";
import {
  enterMoveTarget,
  findMatrixCell,
  moveMatrixFocus,
} from "../layers/dms-ui/app/entries/composables/matrix/matrixNavigation";

describe("keyboard", () => {
  const focusOrder = { rowIds: ["r1", "r2", "r3"], columnIds: ["a", "b", "c"] };
  const at = (rowId: string, columnId: string) => ({ rowId, columnId });

  it("moves by one cell, to the edges with Ctrl, and stays inside the grid", () => {
    expect(moveMatrixFocus(focusOrder, at("r1", "a"), "ArrowDown")).toEqual(
      at("r2", "a"),
    );
    expect(moveMatrixFocus(focusOrder, at("r1", "a"), "ArrowUp")).toEqual(
      at("r1", "a"),
    );
    expect(
      moveMatrixFocus(focusOrder, at("r2", "b"), "ArrowRight", true),
    ).toEqual(at("r2", "c"));
    expect(moveMatrixFocus(focusOrder, at("r2", "b"), "End", true)).toEqual(
      at("r3", "c"),
    );
    expect(moveMatrixFocus(focusOrder, at("r2", "b"), "Home")).toEqual(
      at("r2", "a"),
    );
    expect(moveMatrixFocus(focusOrder, at("r1", "a"), "PageDown")).toEqual(
      at("r3", "a"),
    );
    expect(moveMatrixFocus(focusOrder, null, "ArrowDown")).toEqual(
      at("r1", "a"),
    );
    expect(moveMatrixFocus(focusOrder, at("r1", "a"), "x")).toBeNull();
  });

  it("finds the next editable cell row by row, not past the last", () => {
    const editable = (address: { columnId: string }) =>
      address.columnId !== "b";
    expect(findMatrixCell(focusOrder, at("r1", "a"), 1, editable)).toEqual(
      at("r1", "c"),
    );
    expect(findMatrixCell(focusOrder, at("r1", "c"), 1, editable)).toEqual(
      at("r2", "a"),
    );
    expect(findMatrixCell(focusOrder, at("r2", "a"), -1, editable)).toEqual(
      at("r1", "c"),
    );
    expect(findMatrixCell(focusOrder, at("r3", "c"), 1, editable)).toBeNull();
  });

  it("goes round to find the next empty cell", () => {
    const empty = (address: { rowId: string; columnId: string }) =>
      address.rowId === "r1" && address.columnId === "b";
    expect(findMatrixCell(focusOrder, at("r3", "a"), 1, empty, true)).toEqual(
      at("r1", "b"),
    );
    expect(findMatrixCell(focusOrder, null, 1, empty, true)).toEqual(
      at("r1", "b"),
    );
    expect(
      findMatrixCell(focusOrder, at("r1", "b"), 1, empty, true),
    ).toBeNull();
  });

  it("moves down, right or nowhere after Enter", () => {
    expect(enterMoveTarget(focusOrder, at("r1", "a"), "down")).toEqual(
      at("r2", "a"),
    );
    expect(enterMoveTarget(focusOrder, at("r1", "a"), "right")).toEqual(
      at("r1", "b"),
    );
    expect(enterMoveTarget(focusOrder, at("r1", "a"), "stay")).toEqual(
      at("r1", "a"),
    );
  });
});
