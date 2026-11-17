import type { ComputedRef, Ref } from "vue";
import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import type { ApiErrorPresenter } from "#dms-core/app/composables/useApiErrorPresenter";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import type { FormFieldOrGroup } from "../../../composables/form/types/field";
import {
  collectSubmitData,
  createFieldValueComparer,
  withConditionFields,
} from "../../../composables/form/useForm";
import type {
  TableViewColumn,
  TableViewInlineEditConfig,
  TableViewListResponse,
} from "../../../composables/table-view/types";
import type { FormData } from "../../../composables/form/types/value";
import type { Data } from "../../components/table/Table.types";
import { readRowField } from "../data-types/cellHelpers";
import { detach } from "../detach";
import {
  flattenFormFields,
  type InlineEditColumn,
  resolveInlineEditColumns,
} from "./utils/inlineEdit";

/** A row's value in a cell, or what its input holds. */
type CellValue = Parameters<DataTypeFormatter>[0];

/** Whatever a failed save threw, as the error presenter reads it. */
type SaveFailure = Parameters<ApiErrorPresenter["presentError"]>[0];

export interface TableInlineEditOptions<T extends Data> {
  /** The backend `inlineEdit` option. */
  inlineEdit: boolean | TableViewInlineEditConfig | undefined;
  /**
   * The fields of the edit form, which say what may be edited and how. The
   * server leaves the form out for a caller without the edit action.
   */
  editFields: ReadonlyArray<FormFieldOrGroup> | undefined;
  columns: ReadonlyArray<TableViewColumn>;
  /** The page listed; a saved value updates it in place. */
  data: Ref<TableViewListResponse<T> | null | undefined>;
  rowIdKey: string;
  /** The field naming a row, for the label of its cells' inputs. */
  labelKey?: string;
  location: string;
  api: ReturnType<typeof $fetch.create>;
  getDataType: (type: string) => DataType | undefined;
  /** The `edit` action's rule accepts the row. */
  canEditRow: (row: T) => boolean;
  /** Cells may be edited now (not while the archived rows are listed). */
  isEnabled: ComputedRef<boolean>;
  /**
   * Reads a saved row again: the row as the server stored it (a date as it
   * answers dates, what it derived from the edit) replaces the one listed.
   */
  getRow: (id: string) => Promise<T | undefined>;
  /** After a save: what counts or summarises the rows reads them again. */
  onSaved: () => Promise<void> | void;
  onError: (error: SaveFailure) => void;
}

/** The cell open for editing, and the value its input holds. */
interface ActiveInlineEdit {
  rowId: string;
  columnId: string;
  draft: CellValue;
  /** The row's value as the input started with it. */
  initial: CellValue;
}

/** A value being saved, which its cell shows meanwhile. */
export interface PendingInlineSave {
  value: CellValue;
}

/** A value the server refused, kept for the cell to open on again. */
interface FailedInlineSave {
  draft: CellValue;
  /** The row's value the refused one was to replace. */
  base: CellValue;
}

const cellKey = (rowId: string, columnId: string) =>
  `${rowId}\u0000${columnId}`;

/** Drops `key` from a record held in a ref, leaving the others as they are. */
function forget<V>(record: Ref<Record<string, V>>, key: string): void {
  if (!Object.hasOwn(record.value, key)) return;
  const { [key]: _gone, ...rest } = record.value;
  record.value = rest;
}

/** What a row's cells allow and hold, read from the row and the edit form. */
function useInlineEditCells<T extends Data>(
  options: TableInlineEditOptions<T>,
) {
  const editableColumns = resolveInlineEditColumns(
    options.inlineEdit,
    options.editFields,
    options.columns,
  );
  const conditionFields = [...editableColumns.values()].map(
    (column) => column.field,
  );

  const rowIdOf = (row: T): string | undefined => {
    const id = readRowField(row, options.rowIdKey);
    return id === undefined || id === null ? undefined : String(id);
  };

  const rowLabel = (row: T): string => {
    const label = readRowField(row, options.labelKey);
    return String(label ?? rowIdOf(row) ?? "");
  };

  const columnOf = (columnId: string) =>
    options.isEnabled.value ? editableColumns.get(columnId) : undefined;

  const isLockedOnRow = (row: T, fieldId: string): boolean => {
    const { disabled, hidden } = withConditionFields(conditionFields, row, {});
    return disabled.has(fieldId) || hidden.has(fieldId);
  };

  const isCellEditable = (row: T, columnId: string): boolean => {
    const column = columnOf(columnId);
    if (!column || rowIdOf(row) === undefined) return false;
    if (!options.canEditRow(row)) return false;
    return !isLockedOnRow(row, column.field.id);
  };

  /** The row's value in the column, as the column's input takes it. */
  const stateValue = (row: T, column: InlineEditColumn): CellValue => {
    const value = readRowField(row, column.field.id);
    const type = column.field.type;
    const mapper = type
      ? options.getDataType(type)?.beforeStateMapper
      : undefined;
    return mapper && value !== undefined
      ? mapper(value, column.field.component.options)
      : value;
  };

  return {
    editableColumns,
    rowIdOf,
    rowLabel,
    columnOf,
    isCellEditable,
    stateValue,
  };
}

type InlineEditCells<T extends Data> = ReturnType<typeof useInlineEditCells<T>>;

/** The open cell, the values being saved and the ones refused. */
interface InlineEditState {
  active: Ref<ActiveInlineEdit | null>;
  pending: Ref<Record<string, PendingInlineSave>>;
  failed: Ref<Record<string, FailedInlineSave>>;
}

/** A value's way to the edit route, and back into the listed page. */
function useInlineEditSaves<T extends Data>(
  options: TableInlineEditOptions<T>,
  cells: InlineEditCells<T>,
  state: InlineEditState,
) {
  const { data } = options;
  const { active, pending, failed } = state;
  const isSameValue = createFieldValueComparer(options.getDataType);
  const formFieldIds = flattenFormFields(options.editFields ?? []).map(
    (field) => field.id,
  );
  const isActiveCell = (rowId: string, columnId: string): boolean =>
    active.value?.rowId === rowId && active.value.columnId === columnId;

  /** Closes the open cell, dropping its value (and a refusal it held). */
  const cancel = () => {
    const cell = active.value;
    if (cell) forget(failed, cellKey(cell.rowId, cell.columnId));
    active.value = null;
  };

  const changeBody = (
    column: InlineEditColumn,
    value: CellValue,
    initial: CellValue,
  ): FormData | undefined => {
    const { field } = column;
    const body = collectSubmitData({ [field.id]: value }, [field], {
      initialValues: { [field.id]: initial },
      onlyChanged: true,
      isSameValue,
    });
    return Object.hasOwn(body, field.id) ? body : undefined;
  };

  const replaceRow = (rowId: string, next: (row: T) => T) => {
    const page = data.value;
    if (!page) return;
    data.value = {
      ...page,
      results: page.results.map((row) =>
        cells.rowIdOf(row) === rowId ? next(row) : row,
      ),
    };
  };

  const settleRow = async (rowId: string, body: FormData) => {
    const fresh = await options.getRow(rowId).catch(() => undefined);
    replaceRow(rowId, (row) => fresh ?? { ...row, ...body });
  };

  const write = async (
    rowId: string,
    columnId: string,
    body: FormData,
  ): Promise<void> => {
    const key = cellKey(rowId, columnId);
    const [value] = Object.values(body);
    pending.value = { ...pending.value, [key]: { value } };
    try {
      await options.api(`${options.location}/edit`, {
        method: "PUT",
        query: { id: rowId },
        body,
      });
      await settleRow(rowId, body);
    } finally {
      forget(pending, key);
    }
    detach(Promise.resolve(options.onSaved()));
  };

  const isRefusedElsewhere = (error: SaveFailure, fieldId: string) => {
    const { fields } = resolveFieldErrors(error, { fields: formFieldIds });
    return (
      fields.length > 0 && !fields.some((entry) => entry.field === fieldId)
    );
  };

  const commitCell = async (cell: ActiveInlineEdit): Promise<boolean> => {
    const key = cellKey(cell.rowId, cell.columnId);
    if (pending.value[key]) return false;
    const column = cells.columnOf(cell.columnId);
    const body = column && changeBody(column, cell.draft, cell.initial);
    if (!body || !column) {
      if (isActiveCell(cell.rowId, cell.columnId)) cancel();
      return true;
    }
    try {
      await write(cell.rowId, cell.columnId, body);
    } catch (error) {
      options.onError(error);
      if (isRefusedElsewhere(error, column.field.id)) {
        if (isActiveCell(cell.rowId, cell.columnId)) cancel();
        return false;
      }
      failed.value = {
        ...failed.value,
        [key]: { draft: cell.draft, base: cell.initial },
      };
      return false;
    }
    forget(failed, key);
    if (isActiveCell(cell.rowId, cell.columnId)) active.value = null;
    return true;
  };

  /** Saves a switch or a checkbox as it toggles: no cell opens. */
  const toggle = async (
    row: T,
    columnId: string,
    value: CellValue,
  ): Promise<boolean> => {
    const column = cells.columnOf(columnId);
    const rowId = cells.rowIdOf(row);
    if (!column || rowId === undefined || !cells.isCellEditable(row, columnId))
      return false;
    if (pending.value[cellKey(rowId, columnId)]) return false;
    const body = changeBody(column, value, cells.stateValue(row, column));
    if (!body) return true;
    try {
      await write(rowId, columnId, body);
      return true;
    } catch (error) {
      options.onError(error);
      return false;
    }
  };

  return { isActiveCell, isSameValue, cancel, commitCell, toggle };
}

/**
 * The simple values of a row edited in the grid, one cell at a time, each
 * saved at once by a partial edit of its field (backend `inlineEdit`). An
 * unchanged value sends nothing. A refused value stays in its cell, marked
 * invalid: open on it when the user is still there, offered again when they
 * come back to it otherwise, never taking the keyboard from the cell they
 * went on to.
 */
export function useTableInlineEdit<T extends Data>(
  options: TableInlineEditOptions<T>,
) {
  const cells = useInlineEditCells(options);
  const { rowIdOf, columnOf, stateValue } = cells;
  const state: InlineEditState = {
    active: ref<ActiveInlineEdit | null>(null),
    pending: ref<Record<string, PendingInlineSave>>({}),
    failed: ref<Record<string, FailedInlineSave>>({}),
  };
  const { active, pending, failed } = state;
  const saves = useInlineEditSaves(options, cells, state);
  const { isActiveCell, commitCell } = saves;

  const columns = computed<InlineEditColumn[]>(() =>
    options.isEnabled.value ? [...cells.editableColumns.values()] : [],
  );
  const keyOf = (row: T, columnId: string): string =>
    cellKey(rowIdOf(row) ?? "", columnId);

  const isEditing = (row: T, columnId: string): boolean => {
    const rowId = rowIdOf(row);
    return rowId !== undefined && isActiveCell(rowId, columnId);
  };

  /** The value being saved for the cell, which it shows meanwhile. */
  const pendingOf = (row: T, columnId: string): PendingInlineSave | undefined =>
    pending.value[keyOf(row, columnId)];

  const refusalOf = (
    row: T,
    columnId: string,
  ): FailedInlineSave | undefined => {
    const refused = failed.value[keyOf(row, columnId)];
    const column = columnOf(columnId);
    if (!refused || !column) return undefined;
    const isCurrent = saves.isSameValue(
      column.field,
      stateValue(row, column),
      refused.base,
    );
    return isCurrent ? refused : undefined;
  };

  /** The value the cell shows: the one being saved, else the row's. */
  const valueOf = (row: T, columnId: string): CellValue => {
    const saving = pendingOf(row, columnId);
    if (saving) return saving.value;
    const column = columnOf(columnId);
    return column ? stateValue(row, column) : undefined;
  };

  const start = (row: T, columnId: string): boolean => {
    const column = columnOf(columnId);
    const rowId = rowIdOf(row);
    if (!column || rowId === undefined || !cells.isCellEditable(row, columnId))
      return false;
    if (isActiveCell(rowId, columnId)) return true;
    if (active.value) detach(commitCell(active.value));
    const initial = stateValue(row, column);
    const refused = refusalOf(row, columnId);
    if (!refused) forget(failed, cellKey(rowId, columnId));
    const draft = refused ? refused.draft : initial;
    active.value = { rowId, columnId, draft, initial };
    return true;
  };

  /**
   * Saves the open cell's value (Enter, leaving the cell, a pick); without a
   * change, only closes it. Given a cell, only if that one is open.
   */
  const commit = (row?: T, columnId?: string): Promise<boolean> => {
    const cell = active.value;
    if (!cell) return Promise.resolve(false);
    const isOtherCell =
      row !== undefined &&
      (cell.rowId !== rowIdOf(row) || cell.columnId !== columnId);
    return isOtherCell ? Promise.resolve(false) : commitCell(cell);
  };

  const { inlineEdit } = options;
  return {
    columns,
    /** `always`: every editable cell is drawn as its input. */
    inputs:
      inlineEdit === undefined || inlineEdit === true || inlineEdit === false
        ? "hover"
        : (inlineEdit.inputs ?? "hover"),
    columnOf,
    rowLabel: cells.rowLabel,
    isCellEditable: cells.isCellEditable,
    isEditing,
    isSaving: (row: T, columnId: string) => !!pendingOf(row, columnId),
    isInvalid: (row: T, columnId: string) => !!refusalOf(row, columnId),
    pendingOf,
    valueOf,
    draft: computed(() => active.value?.draft),
    start,
    setDraft: (value: CellValue) => {
      if (active.value) active.value = { ...active.value, draft: value };
    },
    cancel: saves.cancel,
    commit,
    toggle: saves.toggle,
  };
}

/** The inline edit of a table view, as its cells use it. */
export type TableInlineEdit<T extends Data> = ReturnType<
  typeof useTableInlineEdit<T>
>;
