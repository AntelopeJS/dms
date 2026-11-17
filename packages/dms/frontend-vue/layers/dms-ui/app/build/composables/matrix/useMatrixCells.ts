import type { ComputedRef } from "vue";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  MatrixCellState,
  MatrixColumn,
  MatrixOptions,
  MatrixRow,
  MatrixRowAction,
  MatrixValue,
} from "../../../types/matrix";
import { useActionTargets } from "../actions/useActionTargets";
import { detach } from "../detach";
import type { MatrixSaveEngine } from "./matrixSaveEngine";
import { isEmptyValue } from "./matrixValues";

/** What a grid's cells and row actions read of the block. */
export interface MatrixCellsSetup {
  options: MatrixOptions;
  componentId: string;
  pageId: string;
  canEdit: ComputedRef<boolean>;
  valueOf: (row: MatrixRow, columnId: string) => MatrixValue | undefined;
  text: (text: BlockText | undefined) => string;
  engine: MatrixSaveEngine;
  /** Reads the rows again, once an action changed something. */
  refresh: () => Promise<void>;
}

/**
 * What a cell allows: its server state, whether it is edited, the
 * `cellAction` a click runs on a cell that is not, and the actions of a row's
 * header menu. A committed value goes to the save engine.
 */
export function useMatrixCells(setup: MatrixCellsSetup) {
  const { options, valueOf, text, engine } = setup;
  const errorPresenter = useApiErrorPresenter();
  const cellState = (row: MatrixRow, columnId: string): MatrixCellState =>
    row.cells?.[columnId] ?? {};
  const isEditable = (row: MatrixRow, column: MatrixColumn) => {
    if (!setup.canEdit.value || column.editable === false || row.readOnly)
      return false;
    const state = cellState(row, column.id);
    return !state.disabled && !state.readOnly;
  };

  const { handleCustomRowAction } = useActionTargets({
    api: useAuthFetch().$authFetch,
    componentId: setup.componentId,
    pageId: setup.pageId,
    refreshCallback: () => detach(setup.refresh()),
    handleApiError: (error, title) =>
      errorPresenter.presentError(error, {
        fallbackKey: title ?? "error.500.description",
      }),
    rowIdKey: "id",
  });
  const runRowAction = (action: MatrixRowAction, row: MatrixRow) =>
    handleCustomRowAction(
      { label: text(action.label), icon: action.icon, target: action.target },
      { ...row.values, id: row.id },
    );
  const hasCellAction = (row: MatrixRow, column: MatrixColumn) =>
    Boolean(options.cellAction) &&
    !cellState(row, column.id).disabled &&
    !isEmptyValue(valueOf(row, column.id));
  const runCellAction = (row: MatrixRow, column: MatrixColumn) => {
    if (!options.cellAction) return;
    handleCustomRowAction(
      { label: text(column.label), target: options.cellAction },
      {
        ...row.values,
        id: row.id,
        column: column.id,
        value: valueOf(row, column.id),
      },
    );
  };

  const commitValue = (
    row: MatrixRow,
    column: MatrixColumn,
    value: MatrixValue,
  ) =>
    detach(
      engine.commit({
        rowId: row.id,
        columnId: column.id,
        value,
        original: row.values[column.id],
      }),
    );

  return {
    cellState,
    isEditable,
    hasCellAction,
    runCellAction,
    runRowAction,
    commitValue,
  };
}
