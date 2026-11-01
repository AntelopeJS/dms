/**
 * The Matrix grid's keyboard and pointer: the focus moved by the keys, edits
 * started by a click, Enter or a typed character, cells sent to their drawer,
 * switches toggled at once, Tab moving the editor, N jumping to the next
 * empty cell (unfolding its group), Space opening the row, and a click on a
 * read-only cell running the cell action.
 */
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  jumpStepOf,
  useMatrixInteraction,
  type MatrixInteractionOptions,
} from "../layers/dms-ui/app/entries/composables/matrix/useMatrixInteraction";
import type {
  MatrixColumn,
  MatrixOptions,
  MatrixRow,
} from "../layers/dms-ui/app/types/matrix";

const COLUMNS: MatrixColumn[] = [
  { id: "name", label: "Name" },
  { id: "qty", label: "Qty", kind: "number" },
  { id: "on", label: "On", kind: "boolean" },
  { id: "meta", label: "Meta", kind: "json" },
  { id: "id", label: "Id", editable: false },
];

const ROWS: MatrixRow[] = [
  {
    id: "r1",
    values: { name: "Alma", qty: 2, on: true, meta: {}, id: "A1" },
    cells: { name: {} },
  },
  {
    id: "r2",
    values: { name: "", qty: null, on: false, meta: null, id: "A2" },
  },
  { id: "r3", group: "folded", values: { name: "", qty: 1, id: "A3" } },
];

function setup(
  options: MatrixOptions = {},
  overrides: Partial<MatrixInteractionOptions> = {},
) {
  const calls = {
    commit: vi.fn(),
    drawer: vi.fn(),
    rowPanel: vi.fn(),
    action: vi.fn(),
    expand: vi.fn(),
  };
  const shown = ROWS.slice(0, 2);
  const interaction = useMatrixInteraction({
    options,
    root: ref(null),
    shape: () => ({
      rowIds: shown.map((row) => row.id),
      columnIds: COLUMNS.map((column) => column.id),
    }),
    allShape: () => ({
      rowIds: ROWS.map((row) => row.id),
      columnIds: COLUMNS.map((column) => column.id),
    }),
    rowOf: (id) => ROWS.find((row) => row.id === id),
    columnOf: (id) => COLUMNS.find((column) => column.id === id),
    valueOf: (row, columnId) => row.values[columnId],
    isEditable: (_row, column) => column.editable !== false,
    hasCellAction: () => Boolean(options.cellAction),
    runCellAction: calls.action,
    commitValue: calls.commit,
    openCellDrawer: calls.drawer,
    openRowPanel: calls.rowPanel,
    hasRowPanel: () => Boolean(options.rowPanel),
    expandGroupOf: calls.expand,
    cellEditIn: (row, columnId) => row.cells?.[columnId]?.editIn,
    ...overrides,
  });
  return { interaction, calls };
}

/** The element a key is pressed on: a cell, or a button inside the grid. */
const CELL_TARGET = {
  matches: (selector: string) => selector === "[data-matrix-cell]",
};
const BUTTON_TARGET = { matches: () => false };

function key(
  name: string,
  init: KeyboardEventInit = {},
  target: object = CELL_TARGET,
): KeyboardEvent {
  return {
    key: name,
    code: `Key${name.toUpperCase()}`,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    target,
    ...init,
  } as unknown as KeyboardEvent;
}

const at = (rowId: string, columnId: string) => ({ rowId, columnId });

describe("focus and editing", () => {
  it("moves the focus with the arrows, from the first cell", () => {
    const { interaction } = setup();
    interaction.onKeydown(key("ArrowDown"));
    expect(interaction.focus.value).toEqual(at("r1", "name"));
    interaction.onKeydown(key("ArrowRight"));
    interaction.onKeydown(key("ArrowDown"));
    expect(interaction.focus.value).toEqual(at("r2", "qty"));
  });

  it("edits the focused cell on Enter, and commits then moves down", () => {
    const { interaction, calls } = setup({ enterMove: "down" });
    interaction.focusCell(at("r1", "name"));
    interaction.onKeydown(key("Enter"));
    expect(interaction.editing.value).toMatchObject(at("r1", "name"));
    interaction.commitEdit("Bella", "down");
    expect(calls.commit).toHaveBeenCalledWith(ROWS[0], COLUMNS[0], "Bella");
    expect(interaction.editing.value).toBeNull();
    expect(interaction.focus.value).toEqual(at("r2", "name"));
  });

  it("starts editing with a typed character when typeToEdit is on", () => {
    const { interaction } = setup({ typeToEdit: true });
    interaction.focusCell(at("r1", "qty"));
    interaction.onKeydown(key("7"));
    expect(interaction.editing.value).toMatchObject({
      ...at("r1", "qty"),
      draft: "7",
      hasDraft: true,
    });
  });

  it("ignores typing without typeToEdit", () => {
    const { interaction } = setup();
    interaction.focusCell(at("r1", "qty"));
    interaction.onKeydown(key("7"));
    expect(interaction.editing.value).toBeNull();
  });

  it("follows a cell's own editIn over its column's", () => {
    const { interaction, calls } = setup();
    ROWS[0]!.cells = { name: { editIn: "panel" } };
    interaction.startEdit(at("r1", "name"));
    expect(calls.drawer).toHaveBeenCalledWith(
      at("r1", "name"),
      expect.anything(),
    );
    ROWS[0]!.cells = { name: {} };
  });

  it("sends a JSON cell to its drawer and toggles a switch at once", () => {
    const { interaction, calls } = setup();
    interaction.startEdit(at("r1", "meta"));
    expect(calls.drawer).toHaveBeenCalledWith(
      at("r1", "meta"),
      expect.objectContaining({ hasDraft: false }),
    );
    interaction.startEdit(at("r1", "on"));
    expect(calls.commit).toHaveBeenCalledWith(ROWS[0], COLUMNS[2], false);
    expect(interaction.editing.value).toBeNull();
  });

  it("keeps editing from cell to cell with Tab, past switches and drawers", () => {
    const { interaction } = setup();
    interaction.startEdit(at("r1", "qty"));
    interaction.commitEdit(3, "next");
    expect(interaction.focus.value).toEqual(at("r1", "on"));
    expect(interaction.editing.value).toBeNull();
    interaction.startEdit(at("r1", "name"));
    interaction.commitEdit("x", "next");
    expect(interaction.editing.value).toMatchObject(at("r1", "qty"));
  });

  it("edits on a click", () => {
    const { interaction } = setup();
    interaction.onCellClick(at("r1", "name"));
    expect(interaction.focus.value).toEqual(at("r1", "name"));
    expect(interaction.editing.value).toMatchObject(at("r1", "name"));
  });

  it("toggles a switch on a click, without an editor", () => {
    const { interaction, calls } = setup();
    interaction.onCellClick(at("r1", "on"));
    expect(interaction.editing.value).toBeNull();
    expect(calls.commit).toHaveBeenCalledWith(ROWS[0], COLUMNS[2], false);
  });
});

describe("shortcuts", () => {
  it("jumps to the next empty editable cell, unfolding its group", () => {
    const { interaction, calls } = setup({ jumpToEmpty: true });
    interaction.focusCell(at("r1", "id"));
    interaction.onKeydown(key("n"));
    expect(interaction.focus.value).toEqual(at("r2", "name"));
    interaction.onKeydown(key("n"));
    expect(interaction.focus.value).toEqual(at("r2", "qty"));
    interaction.onKeydown(key("n"));
    expect(interaction.focus.value).toEqual(at("r2", "meta"));
    interaction.onKeydown(key("n"));
    expect(interaction.focus.value).toEqual(at("r3", "name"));
    expect(calls.expand).toHaveBeenLastCalledWith("r3");
    interaction.onKeydown(key("N", { shiftKey: true }));
    expect(interaction.focus.value).toEqual(at("r2", "meta"));
  });

  it("opens the row on Space when the grid has a row drawer", () => {
    const { interaction, calls } = setup({ rowPanel: true });
    interaction.focusCell(at("r2", "qty"));
    interaction.onKeydown(key(" "));
    expect(calls.rowPanel).toHaveBeenCalledWith("r2");
  });

  it("runs the cell action on a click of a cell that does not edit", () => {
    const { interaction, calls } = setup({
      cellAction: { type: "page", url: "/orders?ref={{row.value}}" },
    });
    interaction.onCellClick(at("r1", "id"));
    expect(calls.action).toHaveBeenCalledWith(ROWS[0], COLUMNS[4]);
    interaction.focusCell(at("r1", "id"));
    interaction.onKeydown(key("Enter"));
    expect(calls.action).toHaveBeenCalledTimes(2);
  });

  it("leaves the keys of a button inside the grid alone", () => {
    const { interaction, calls } = setup({ rowPanel: true });
    interaction.focusCell(at("r1", "name"));
    const enter = key("Enter", {}, BUTTON_TARGET);
    interaction.onKeydown(enter);
    interaction.onKeydown(key(" ", {}, BUTTON_TARGET));
    interaction.onKeydown(key("ArrowDown", {}, BUTTON_TARGET));
    expect(interaction.editing.value).toBeNull();
    expect(calls.rowPanel).not.toHaveBeenCalled();
    expect(interaction.focus.value).toEqual(at("r1", "name"));
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it("types into the cell with typeToEdit, and jumps with Alt+N", () => {
    const { interaction } = setup({ jumpToEmpty: true, typeToEdit: true });
    interaction.focusCell(at("r1", "name"));
    interaction.onKeydown(key("n"));
    expect(interaction.editing.value).toMatchObject({
      ...at("r1", "name"),
      draft: "n",
    });
    interaction.stopEditing();
    interaction.onKeydown(key("˜", { altKey: true, code: "KeyN" }));
    expect(interaction.focus.value).toEqual(at("r2", "name"));
    interaction.onKeydown(
      key("N", { altKey: true, shiftKey: true, code: "KeyN" }),
    );
    expect(interaction.focus.value).toEqual(at("r3", "meta"));
  });

  it("lets Escape drop the focus", () => {
    const { interaction } = setup();
    interaction.focusCell(at("r1", "name"));
    interaction.onKeydown(key("Escape"));
    expect(interaction.focus.value).toBeNull();
  });
});

describe("jump keys", () => {
  it("reads N, Shift+N, or Alt+N with typeToEdit", () => {
    const press = (init: KeyboardEventInit) =>
      ({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...init,
      }) as KeyboardEvent;
    expect(jumpStepOf(press({ key: "n", code: "KeyN" }), false)).toBe(1);
    expect(
      jumpStepOf(press({ key: "N", code: "KeyN", shiftKey: true }), false),
    ).toBe(-1);
    expect(jumpStepOf(press({ key: "n", code: "KeyN" }), true)).toBeNull();
    expect(
      jumpStepOf(press({ key: "Dead", code: "KeyN", altKey: true }), true),
    ).toBe(1);
    expect(
      jumpStepOf(press({ key: "n", code: "KeyN", ctrlKey: true }), false),
    ).toBeNull();
  });
});
