/** @vitest-environment jsdom */
/**
 * A Matrix cell's editor left by ArrowUp or ArrowDown: the value typed into
 * its input is saved before the focus moves a row, for a number cell and a
 * text cell. The number input is reka-ui's number field, the one the DMS
 * number input is built on: it takes typed text into its value only on
 * Enter or when it loses the focus.
 */
import { nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mountMatrix,
  press,
  stubMatrixRuntime,
  typeInto,
} from "./helpers/matrix-runtime";
import type {
  MatrixColumn,
  MatrixData,
  MatrixSaveRequest,
} from "../layers/dms-ui/app/types/matrix";

const PRICE: MatrixColumn = {
  id: "price",
  label: "Price",
  kind: "number",
  max: 100,
};
const NOTE: MatrixColumn = { id: "note", label: "Note", kind: "text" };

const GRID: MatrixData = {
  columns: [PRICE, NOTE],
  rows: [
    { id: "r1", label: "Desk", values: { price: 40, note: "oak" } },
    { id: "r2", label: "Lamp", values: { price: 43, note: "abc" } },
    { id: "r3", label: "Chair", values: { price: 12, note: "ash" } },
  ],
};

let saves: MatrixSaveRequest[] = [];
let unmount: (() => void) | undefined;

beforeEach(async () => {
  saves = await stubMatrixRuntime();
});

afterEach(() => {
  unmount?.();
  vi.unstubAllGlobals();
});

/** The grid mounted, its cell `rowId` / `columnId` open for editing. */
async function openEditor(rowId: string, columnId: string) {
  const grid = await mountMatrix({
    saveUrl: "/api/products/grid/save",
    staticData: GRID,
  });
  unmount = grid.unmount;
  const input = await grid.openEditor(rowId, columnId);
  return { input, cellOf: grid.cellOf };
}

const changesSaved = () =>
  saves.flatMap(({ changes }) =>
    changes.map(({ rowId, columnId, value }) => ({ rowId, columnId, value })),
  );

it.each([
  ["ArrowUp", "r1"],
  ["ArrowDown", "r3"],
])(
  "saves the number typed over 43 as 44 on %s and moves to %s, never stepping it (fails when the arrow commits before the number input takes the typed text, so the edit is lost)",
  async (key, landing) => {
    const { input, cellOf } = await openEditor("r2", "price");

    await typeInto(input, "44");
    press(input, key);

    await vi.waitFor(() =>
      expect(changesSaved()).toEqual([
        { rowId: "r2", columnId: "price", value: 44 },
      ]),
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(cellOf(landing, "price")),
    );
  },
);

it("keeps 43 and moves down on ArrowDown when nothing was typed, rather than stepping the number to 42 or 44 (fails when the arrow reaches the number input, which steps its value)", async () => {
  const { input, cellOf } = await openEditor("r2", "price");

  press(input, "ArrowDown");

  await vi.waitFor(() =>
    expect(document.activeElement).toBe(cellOf("r3", "price")),
  );
  expect(changesSaved()).toEqual([]);
});

it.each([
  ["ArrowUp", "r1"],
  ["ArrowDown", "r3"],
])(
  "saves the text typed in a text cell on %s and moves to %s (fails when the arrow drops a typed text)",
  async (key, landing) => {
    const { input, cellOf } = await openEditor("r2", "note");

    await typeInto(input, "abd");
    press(input, key);

    await vi.waitFor(() =>
      expect(changesSaved()).toEqual([
        { rowId: "r2", columnId: "note", value: "abd" },
      ]),
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(cellOf(landing, "note")),
    );
  },
);

it("keeps the editor open on its input when the arrow meets a number the column refuses, 500 over a maximum of 100, and saves nothing (fails when the refused draft leaves the input without the focus, or is saved)", async () => {
  const { input } = await openEditor("r2", "price");

  await typeInto(input, "500");
  press(input, "ArrowDown");
  await nextTick();

  expect([changesSaved(), document.activeElement === input]).toEqual([
    [],
    true,
  ]);
});
