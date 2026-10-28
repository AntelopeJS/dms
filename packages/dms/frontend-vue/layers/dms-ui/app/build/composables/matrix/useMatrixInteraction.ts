import { nextTick, ref, type Ref } from "vue";
import type {
  MatrixColumn,
  MatrixEditIn,
  MatrixEnterMove,
  MatrixOptions,
  MatrixRow,
} from "../../../types/matrix";
import {
  enterMoveTarget,
  findMatrixCell,
  isMatrixMoveKey,
  isTypedCharacter,
  moveMatrixFocus,
  type MatrixCellAddress,
  type MatrixGridShape,
} from "./matrixNavigation";
import {
  acceptsTypedStart,
  editsInPanel,
  isEmptyValue,
  kindOf,
} from "./matrixValues";

/** The cell being edited in place, and the text it was started with. */
export interface MatrixEditing extends MatrixCellAddress {
  /** A typed first character, or a draft carried over. */
  draft?: unknown;
  hasDraft: boolean;
  /** The draft is an editor's model (a JSON text), not a cell value. */
  isModel?: boolean;
}

/** Where a committed edit moves the focus. */
export type MatrixCommitMove = MatrixEnterMove | "next" | "previous";

/** What the interaction needs from the grid around it. */
export interface MatrixInteractionOptions {
  options: MatrixOptions;
  root: Ref<HTMLElement | null>;
  /** The rows drawn and the columns shown, as the focus moves through them. */
  shape: () => MatrixGridShape;
  /** Every row, collapsed groups included: N searches them all. */
  allShape: () => MatrixGridShape;
  rowOf: (rowId: string) => MatrixRow | undefined;
  columnOf: (columnId: string) => MatrixColumn | undefined;
  valueOf: (row: MatrixRow, columnId: string) => unknown;
  isEditable: (row: MatrixRow, column: MatrixColumn) => boolean;
  /** A click or Enter on a cell that does not edit: the block's `cellAction`. */
  hasCellAction: (row: MatrixRow, column: MatrixColumn) => boolean;
  runCellAction: (row: MatrixRow, column: MatrixColumn) => void;
  commitValue: (row: MatrixRow, column: MatrixColumn, value: unknown) => void;
  openCellDrawer: (address: MatrixCellAddress, editing?: MatrixEditing) => void;
  openRowPanel: (rowId: string) => void;
  hasRowPanel: () => boolean;
  expandGroupOf: (rowId: string) => void;
  /** A cell's own `editIn`, over its column's. */
  cellEditIn: (row: MatrixRow, columnId: string) => MatrixEditIn | undefined;
}

const CELL_SELECTOR = "[data-matrix-cell]";
const JUMP_KEY_CODE = "KeyN";
const JUMP_KEYS: ReadonlySet<string> = new Set(["n", "N"]);
type KeyHandler = (event: KeyboardEvent, focus: MatrixCellAddress) => boolean;

/** A step through the cells: `1` to the next, `-1` to the previous. */
export type MatrixJumpStep = 1 | -1;

/**
 * The step a key asks of `jumpToEmpty`: N and Shift+N, or, when a typed
 * letter starts editing (`typeToEdit`), Alt+N and Alt+Shift+N, read from the
 * key's position since Alt+N types another character on a Mac.
 */
export function jumpStepOf(
  event: KeyboardEvent,
  hasTypeToEdit: boolean,
): MatrixJumpStep | null {
  if (event.ctrlKey || event.metaKey) return null;
  const isJump = hasTypeToEdit
    ? event.altKey && event.code === JUMP_KEY_CODE
    : !event.altKey && JUMP_KEYS.has(event.key);
  if (!isJump) return null;
  return event.shiftKey ? -1 : 1;
}

/** A key pressed on a cell itself, not on a button inside the grid. */
function isOnCell(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  return typeof target?.matches === "function" && target.matches(CELL_SELECTOR);
}

/**
 * The grid's keyboard and pointer: one focused cell moved with the arrows,
 * Home / End and PageUp / PageDown; a click, Enter or F2 edits it in place
 * or in a drawer; a typed character starts editing with it; Space opens the
 * row; N and Shift+N jump to the next or previous empty editable cell; a
 * click on a cell that does not edit runs `cellAction`.
 */
export function useMatrixInteraction(source: MatrixInteractionOptions) {
  const { options } = source;
  const focus = ref<MatrixCellAddress | null>(null);
  const editing = ref<MatrixEditing | null>(null);
  const hover = ref<MatrixCellAddress | null>(null);
  /** The in-place editor's commit, while one is open (Ctrl+S runs it first). */
  let openEditorCommit: (() => void) | null = null;

  function cellElement(address: MatrixCellAddress): HTMLElement | null {
    const cells =
      source.root.value?.querySelectorAll<HTMLElement>(CELL_SELECTOR) ?? [];
    return (
      [...cells].find(
        (cell) =>
          cell.dataset.rowId === address.rowId &&
          cell.dataset.columnId === address.columnId,
      ) ?? null
    );
  }

  /**
   * Moves the focus to a cell, on screen and to the keyboard. A cell whose
   * editor opened meanwhile (a click that edits) keeps the keyboard in it.
   */
  function focusCell(address: MatrixCellAddress | null): void {
    focus.value = address;
    if (!address) return;
    void nextTick(() => {
      const element = cellElement(address);
      element?.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (!element || element.contains(document.activeElement)) return;
      if (isEditing(address.rowId, address.columnId)) return;
      element.focus();
    });
  }

  const resolve = (address: MatrixCellAddress) => {
    const row = source.rowOf(address.rowId);
    const column = source.columnOf(address.columnId);
    return row && column ? { row, column } : null;
  };

  /** Starts editing a cell: in place, in its drawer, or a switch toggled. */
  function startEdit(address: MatrixCellAddress, draft?: unknown): void {
    const cell = resolve(address);
    if (!cell) return;
    const { row, column } = cell;
    if (!source.isEditable(row, column)) {
      if (source.hasCellAction(row, column)) source.runCellAction(row, column);
      return;
    }
    const hasDraft = draft !== undefined;
    const value = hasDraft ? draft : source.valueOf(row, column.id);
    if (kindOf(column) === "boolean") {
      source.commitValue(row, column, !source.valueOf(row, column.id));
      return;
    }
    const entry: MatrixEditing = { ...address, draft, hasDraft };
    if (inPanel(row, column, value)) {
      source.openCellDrawer(address, entry);
      return;
    }
    editing.value = entry;
  }

  const inPanel = (row: MatrixRow, column: MatrixColumn, value: unknown) =>
    editsInPanel(column, value, source.cellEditIn(row, column.id));

  function stopEditing(): void {
    const current = editing.value;
    editing.value = null;
    if (current)
      focusCell({ rowId: current.rowId, columnId: current.columnId });
  }

  function editableAfter(from: MatrixCellAddress, step: 1 | -1) {
    return findMatrixCell(source.shape(), from, step, (address) => {
      const cell = resolve(address);
      return !!cell && source.isEditable(cell.row, cell.column);
    });
  }

  const COMMIT_MOVES: Record<
    MatrixCommitMove,
    (from: MatrixCellAddress) => MatrixCellAddress | null
  > = {
    down: (from) => enterMoveTarget(source.shape(), from, "down"),
    right: (from) => enterMoveTarget(source.shape(), from, "right"),
    stay: (from) => from,
    next: (from) => editableAfter(from, 1),
    previous: (from) => editableAfter(from, -1),
  };

  /** Commits the cell being edited, then moves as asked. */
  function commitEdit(value: unknown, move: MatrixCommitMove): void {
    const current = editing.value;
    if (!current) return;
    const cell = resolve(current);
    editing.value = null;
    if (cell) source.commitValue(cell.row, cell.column, value);
    const target = COMMIT_MOVES[move](current) ?? current;
    focusCell(target);
    if ((move === "next" || move === "previous") && target !== current)
      continueEditing(target);
  }

  function continueEditing(address: MatrixCellAddress): void {
    const cell = resolve(address);
    if (!cell || kindOf(cell.column) === "boolean") return;
    if (
      inPanel(cell.row, cell.column, source.valueOf(cell.row, cell.column.id))
    )
      return;
    editing.value = { ...address, hasDraft: false };
  }

  /** N: the next empty cell the user can fill, groups expanded on the way. */
  function jumpToEmpty(step: MatrixJumpStep): void {
    const target = findMatrixCell(
      source.allShape(),
      focus.value,
      step,
      (address) => {
        const cell = resolve(address);
        if (!cell || !source.isEditable(cell.row, cell.column)) return false;
        return isEmptyValue(source.valueOf(cell.row, cell.column.id));
      },
      true,
    );
    if (!target) return;
    source.expandGroupOf(target.rowId);
    focusCell(target);
    void nextTick(() => {
      cellElement(target)?.scrollIntoView({ block: "center" });
    });
  }

  const KEY_HANDLERS: Record<string, KeyHandler> = {
    Enter: (_event, current) => {
      startEdit(current);
      return true;
    },
    F2: (_event, current) => {
      startEdit(current);
      return true;
    },
    " ": (_event, current) => {
      if (!source.hasRowPanel()) return false;
      source.openRowPanel(current.rowId);
      return true;
    },
    Escape: () => {
      focus.value = null;
      return true;
    },
  };

  function jump(event: KeyboardEvent): boolean {
    if (!options.jumpToEmpty) return false;
    const step = jumpStepOf(event, options.typeToEdit === true);
    if (!step) return false;
    jumpToEmpty(step);
    return true;
  }

  function typeToEdit(event: KeyboardEvent, current: MatrixCellAddress) {
    if (!options.typeToEdit || !isTypedCharacter(event)) return false;
    const cell = resolve(current);
    if (!cell || !acceptsTypedStart(cell.column)) return false;
    if (!source.isEditable(cell.row, cell.column)) return false;
    startEdit(current, event.key);
    return true;
  }

  /**
   * The grid's keydown, while no cell is being edited: only a key pressed on
   * a cell, a button inside the grid (Retry, a fold, a sort) keeps its own.
   */
  function onKeydown(event: KeyboardEvent): void {
    if (editing.value || event.defaultPrevented || !isOnCell(event)) return;
    const current = focus.value ?? null;
    if (isMatrixMoveKey(event.key)) {
      event.preventDefault();
      const isCtrl = event.ctrlKey || event.metaKey;
      focusCell(moveMatrixFocus(source.shape(), current, event.key, isCtrl));
      return;
    }
    if (!current) return;
    if (jump(event)) {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const handler = KEY_HANDLERS[event.key];
    const handled =
      (handler && handler(event, current)) || typeToEdit(event, current);
    if (handled) event.preventDefault();
  }

  /** A click edits the cell, or runs its `cellAction` when it does not edit. */
  function onCellClick(address: MatrixCellAddress): void {
    focusCell(address);
    startEdit(address);
  }

  const isFocused = (rowId: string, columnId: string) =>
    focus.value?.rowId === rowId && focus.value.columnId === columnId;
  const isEditing = (rowId: string, columnId: string) =>
    editing.value?.rowId === rowId && editing.value.columnId === columnId;

  return {
    focus,
    editing,
    hover,
    /** The editor open in place hands its commit over while it is open. */
    registerEditor: (commit: () => void) => {
      openEditorCommit = commit;
      return () => {
        if (openEditorCommit === commit) openEditorCommit = null;
      };
    },
    /** Commits the editor open in place; whether there was one. */
    commitOpenEditor: () => {
      if (!openEditorCommit) return false;
      openEditorCommit();
      return true;
    },
    focusCell,
    startEdit,
    stopEditing,
    commitEdit,
    jumpToEmpty,
    onKeydown,
    onCellClick,
    isFocused,
    isEditing,
  };
}

export type MatrixInteraction = ReturnType<typeof useMatrixInteraction>;
