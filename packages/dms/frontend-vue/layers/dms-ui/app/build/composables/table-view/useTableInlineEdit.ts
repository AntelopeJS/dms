import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { ComputedRef, Ref } from "vue";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";
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
import {
  type InlineEditColumn,
  resolveInlineEditColumns,
} from "./utils/inlineEdit";

export interface TableInlineEditOptions<T> {
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
  /** Reads a saved row again, for what the server derived from the edit. */
  refreshRow: (id: string) => Promise<void> | void;
  /** After a save: what counts or summarises the rows reads them again. */
  onSaved: () => Promise<void> | void;
  onError: (error: unknown) => void;
}

/** The cell open for editing, and the value its input holds. */
interface ActiveInlineEdit {
  rowId: string;
  columnId: string;
  draft: unknown;
  /** The row's value as the input started with it. */
  initial: unknown;
}

/** A save in flight, and the value it writes. */
interface PendingInlineSave {
  value: unknown;
}

const cellKey = (rowId: string, columnId: string) =>
  `${rowId}\u0000${columnId}`;

/**
 * The simple values of a row edited in the grid, one cell at a time, each
 * saved at once by a partial edit of its field (backend `inlineEdit`). An
 * unchanged value sends nothing; a refused one keeps its cell open on the
 * value typed, marked invalid, whichever cell the user went on to.
 */
export function useTableInlineEdit<T>(options: TableInlineEditOptions<T>) {
  const { data, rowIdKey } = options;
  const isSameValue = createFieldValueComparer(options.getDataType);

  const editableColumns = resolveInlineEditColumns(
    options.inlineEdit,
    options.editFields,
    options.columns,
  );
  const conditionFields = [...editableColumns.values()].map(
    (column) => column.field,
  );

  const active = ref<ActiveInlineEdit | null>(null);
  const pending = ref<Record<string, PendingInlineSave>>({});
  const invalidKey = ref<string | null>(null);

  const columns = computed<InlineEditColumn[]>(() =>
    options.isEnabled.value ? [...editableColumns.values()] : [],
  );

  const rowIdOf = (row: T): string | undefined => {
    const id = get(row as never, rowIdKey);
    return id === undefined || id === null ? undefined : String(id);
  };

  const rowLabel = (row: T): string => {
    const label = options.labelKey
      ? get(row as never, options.labelKey)
      : undefined;
    return String(label ?? rowIdOf(row) ?? "");
  };

  const columnOf = (columnId: string) =>
    options.isEnabled.value ? editableColumns.get(columnId) : undefined;

  // A field's `visibleWhen` / `disabledWhen` read on the listed row: the
  // edit route strips a field they hide or lock, so its cell is not offered.
  const isLockedOnRow = (row: T, fieldId: string): boolean => {
    const { disabled, hidden } = withConditionFields(
      conditionFields,
      row as Record<string, unknown>,
      {},
    );
    return disabled.has(fieldId) || hidden.has(fieldId);
  };

  const isCellEditable = (row: T, columnId: string): boolean => {
    const column = columnOf(columnId);
    if (!column || rowIdOf(row) === undefined) return false;
    if (!options.canEditRow(row)) return false;
    return !isLockedOnRow(row, column.field.id);
  };

  const rowValue = (row: T, column: InlineEditColumn): unknown =>
    get(row as never, column.field.id);

  // The value as the edit form would hold it: its data type maps the row's
  // value into the form's state first (a relation's row to its id).
  const stateValue = (row: T, column: InlineEditColumn): unknown => {
    const value = rowValue(row, column);
    const type = column.field.type;
    const mapper = type
      ? options.getDataType(type)?.beforeStateMapper
      : undefined;
    return mapper && value !== undefined
      ? mapper(value, column.field.component.options)
      : value;
  };

  const isEditing = (row: T, columnId: string): boolean => {
    const cell = active.value;
    return !!cell && cell.columnId === columnId && cell.rowId === rowIdOf(row);
  };

  const keyOf = (row: T, columnId: string): string =>
    cellKey(rowIdOf(row) ?? "", columnId);

  const isSaving = (row: T, columnId: string): boolean =>
    !!pending.value[keyOf(row, columnId)];

  const isInvalid = (row: T, columnId: string): boolean =>
    invalidKey.value === keyOf(row, columnId);

  /** The value the cell shows: the one being saved, else the row's. */
  const valueOf = (row: T, columnId: string): unknown => {
    const saving = pending.value[keyOf(row, columnId)];
    if (saving) return saving.value;
    const column = columnOf(columnId);
    return column ? stateValue(row, column) : undefined;
  };

  const start = (row: T, columnId: string): boolean => {
    const column = columnOf(columnId);
    const rowId = rowIdOf(row);
    if (!column || rowId === undefined || !isCellEditable(row, columnId)) {
      return false;
    }
    if (isEditing(row, columnId)) return true;
    // One cell at a time: the one left saves first, as leaving it does.
    if (active.value) void commitCell(active.value);
    const initial = stateValue(row, column);
    active.value = { rowId, columnId, draft: initial, initial };
    invalidKey.value = null;
    return true;
  };

  const setDraft = (value: unknown) => {
    if (active.value) active.value = { ...active.value, draft: value };
  };

  const cancel = () => {
    active.value = null;
    invalidKey.value = null;
  };

  // The body the edit form would send for this field alone: nothing when the
  // value did not change, a cleared value as the form clears it.
  const changeBody = (
    column: InlineEditColumn,
    value: unknown,
    initial: unknown,
  ): Record<string, unknown> | undefined => {
    const { field } = column;
    const body = collectSubmitData({ [field.id]: value }, [field], {
      initialValues: { [field.id]: initial },
      onlyChanged: true,
      isSameValue,
    });
    return field.id in body ? body : undefined;
  };

  const patchRow = (rowId: string, body: Record<string, unknown>) => {
    const page = data.value;
    if (!page) return;
    data.value = {
      ...page,
      results: page.results.map((row) =>
        rowIdOf(row) === rowId ? ({ ...row, ...body } as T) : row,
      ),
    };
  };

  const write = async (
    rowId: string,
    columnId: string,
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    const key = cellKey(rowId, columnId);
    const [value] = Object.values(body);
    pending.value = { ...pending.value, [key]: { value } };
    try {
      await options.api(`${options.location}/edit`, {
        method: "PUT",
        query: { id: rowId },
        body,
      });
    } catch (error) {
      options.onError(error);
      return false;
    } finally {
      const { [key]: _done, ...rest } = pending.value;
      pending.value = rest;
    }
    patchRow(rowId, body);
    void options.refreshRow(rowId);
    void options.onSaved();
    return true;
  };

  const commitCell = async (cell: ActiveInlineEdit): Promise<boolean> => {
    const key = cellKey(cell.rowId, cell.columnId);
    if (pending.value[key]) return false;
    const column = columnOf(cell.columnId);
    const body = column && changeBody(column, cell.draft, cell.initial);
    const isActive = () =>
      active.value?.rowId === cell.rowId &&
      active.value.columnId === cell.columnId;
    if (!body) {
      if (isActive()) cancel();
      return true;
    }
    if (await write(cell.rowId, cell.columnId, body)) {
      if (isActive()) active.value = null;
      if (invalidKey.value === key) invalidKey.value = null;
      return true;
    }
    // Back to the refused cell with what was typed, even if the user went on.
    active.value = cell;
    invalidKey.value = key;
    return false;
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

  /** Saves a switch or a checkbox as it toggles: no cell opens. */
  const toggle = async (row: T, columnId: string, value: unknown) => {
    const column = columnOf(columnId);
    const rowId = rowIdOf(row);
    if (!column || rowId === undefined || !isCellEditable(row, columnId)) {
      return false;
    }
    if (pending.value[cellKey(rowId, columnId)]) return false;
    const body = changeBody(column, value, stateValue(row, column));
    if (!body) return true;
    return write(rowId, columnId, body);
  };

  return {
    columns,
    columnOf,
    rowLabel,
    isCellEditable,
    isEditing,
    isSaving,
    isInvalid,
    valueOf,
    draft: computed(() => active.value?.draft),
    start,
    setDraft,
    cancel,
    commit,
    toggle,
  };
}

/** The inline edit of a table view, as its cells use it. */
export type TableInlineEdit<T> = ReturnType<typeof useTableInlineEdit<T>>;
