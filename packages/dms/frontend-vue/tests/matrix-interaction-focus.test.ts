// @vitest-environment jsdom
/**
 * Where the keyboard lands when a click opens a Matrix cell's editor: in the
 * editor's input, not back on the cell the click focused.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useMatrixInteraction } from "../layers/dms-ui/app/build/composables/matrix/useMatrixInteraction";
import type {
  MatrixColumn,
  MatrixRow,
} from "../layers/dms-ui/app/types/matrix";

const COLUMN: MatrixColumn = { id: "qty", label: "Qty", kind: "number" };
const ROW: MatrixRow = { id: "r1", values: { qty: 2 } };
const AT = { rowId: "r1", columnId: "qty" };

function setup() {
  const root = document.createElement("table");
  root.innerHTML = `<tr><td data-matrix-cell data-row-id="r1" data-column-id="qty" tabindex="-1"></td></tr>`;
  document.body.append(root);
  const cell = root.querySelector<HTMLElement>("td")!;
  cell.scrollIntoView = vi.fn();
  const interaction = useMatrixInteraction({
    options: {},
    root: ref(root),
    shape: () => ({ rowIds: ["r1"], columnIds: ["qty"] }),
    allShape: () => ({ rowIds: ["r1"], columnIds: ["qty"] }),
    rowOf: () => ROW,
    columnOf: () => COLUMN,
    valueOf: (row, columnId) => row.values[columnId],
    isEditable: () => true,
    hasCellAction: () => false,
    runCellAction: vi.fn(),
    commitValue: vi.fn(),
    openCellDrawer: vi.fn(),
    openRowPanel: vi.fn(),
    hasRowPanel: () => false,
    expandGroupOf: vi.fn(),
    cellEditIn: () => undefined,
  });
  return { interaction, cell };
}

/** The editor the click opened, its input focused as it mounts. */
function mountEditor(cell: HTMLElement): HTMLInputElement {
  const input = document.createElement("input");
  cell.append(input);
  input.focus();
  return input;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focus after a click that edits", () => {
  it("leaves the keyboard in the editor's input", async () => {
    const { interaction, cell } = setup();
    interaction.onCellClick(AT);
    const input = mountEditor(cell);
    await nextTick();
    expect(document.activeElement).toBe(input);
  });

  it("does not take the keyboard while the input is still loading", async () => {
    const { interaction } = setup();
    interaction.onCellClick(AT);
    await nextTick();
    expect(interaction.editing.value).toMatchObject(AT);
    expect(document.activeElement).toBe(document.body);
  });

  it("gives the keyboard back to the cell once the edit is cancelled", async () => {
    const { interaction, cell } = setup();
    interaction.onCellClick(AT);
    mountEditor(cell).remove();
    interaction.stopEditing();
    await nextTick();
    expect(document.activeElement).toBe(cell);
  });
});
