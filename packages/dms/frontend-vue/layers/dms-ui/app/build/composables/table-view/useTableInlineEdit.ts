import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { ComputedRef, Ref } from "vue";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";
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
import {
  flattenFormFields,
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
  /**
   * Reads a saved row again: the row as the server stored it (a date as it
   * answers dates, what it derived from the edit) replaces the one listed.
   */
  getRow: (id: string) => Promise<T | undefined>;
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

/** A value being saved, which its cell shows meanwhile. */
export interface PendingInlineSave {
  value: unknown;
}

/** A value the server refused, kept for the cell to open on again. */
interface FailedInlineSave {
  draft: unknown;
  /** The row's value the refused one was to replace. */
  base: unknown;
}

const cellKey = (rowId: string, columnId: string) =>
  `${rowId}\u0000${columnId}`;

/**
 * The simple values of a row edited in the grid, one cell at a time, each
 * saved at once by a partial edit of its field (backend `inlineEdit`). An
 * unchanged value sends nothing. A refused value stays in its cell, marked
 * invalid: open on it when the user is still there, offered again when they
 * come back to it otherwise, never taking the keyboard from the cell they
 * went on to.
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
  const formFieldIds = flattenFormFields(options.editFields ?? []).map(
    (field) => field.id,
  );

  const active = ref<ActiveInlineEdit | null>(null);
  const pending = ref<Record<string, PendingInlineSave>>({});
  const failed = ref<Record<string, FailedInlineSave>>({});

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

  const stateValue = (row: T, column: InlineEditColumn): unknown => {
    const value = get(row as never, column.field.id);
    const type = column.field.type;
    const mapper = type
      ? options.getDataType(type)?.beforeStateMapper
      : undefined;
    return mapper && value !== undefined
      ? mapper(value, column.field.component.options)
      : value;
  };

  const keyOf = (row: T, columnId: string): string =>
    cellKey(rowIdOf(row) ?? "", columnId);

  const isActiveCell = (rowId: string, columnId: string): boolean =>
    active.value?.rowId === rowId && active.value.columnId === columnId;

  const isEditing = (row: T, columnId: string): boolean => {
    const rowId = rowIdOf(row);
    return rowId !== undefined && isActiveCell(rowId, columnId);
  };

  /** The value being saved for the cell, which it shows meanwhile. */
  const pendingOf = (row: T, columnId: string): PendingInlineSave | undefined =>
    pending.value[keyOf(row, columnId)];

  const isSaving = (row: T, columnId: string): boolean =>
    !!pendingOf(row, columnId);

  const refusalOf = (
    row: T,
    columnId: string,
  ): FailedInlineSave | undefined => {
    const refused = failed.value[keyOf(row, columnId)];
    const column = columnOf(columnId);
    if (!refused || !column) return undefined;
    const isCurrent = isSameValue(
      column.field,
      stateValue(row, column),
      refused.base,
    );
    return isCurrent ? refused : undefined;
  };

  const isInvalid = (row: T, columnId: string): boolean =>
    !!refusalOf(row, columnId);

  /** The value the cell shows: the one being saved, else the row's. */
  const valueOf = (row: T, columnId: string): unknown => {
    const saving = pendingOf(row, columnId);
    if (saving) return saving.value;
    const column = columnOf(columnId);
    return column ? stateValue(row, column) : undefined;
  };

  const forget = (record: Ref<Record<string, unknown>>, key: string) => {
    if (!(key in record.value)) return;
    const { [key]: _gone, ...rest } = record.value;
    record.value = rest;
  };

  const start = (row: T, columnId: string): boolean => {
    const column = columnOf(columnId);
    const rowId = rowIdOf(row);
    if (!column || rowId === undefined || !isCellEditable(row, columnId)) {
      return false;
    }
    if (isActiveCell(rowId, columnId)) return true;
    if (active.value) void commitCell(active.value);
    const initial = stateValue(row, column);
    const refused = refusalOf(row, columnId);
    if (!refused) forget(failed, cellKey(rowId, columnId));
    const draft = refused ? refused.draft : initial;
    active.value = { rowId, columnId, draft, initial };
    return true;
  };

  const setDraft = (value: unknown) => {
    if (active.value) active.value = { ...active.value, draft: value };
  };

  /** Closes the open cell, dropping its value (and a refusal it held). */
  const cancel = () => {
    const cell = active.value;
    if (cell) forget(failed, cellKey(cell.rowId, cell.columnId));
    active.value = null;
  };

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

  const replaceRow = (rowId: string, next: (row: T) => T) => {
    const page = data.value;
    if (!page) return;
    data.value = {
      ...page,
      results: page.results.map((row) =>
        rowIdOf(row) === rowId ? next(row) : row,
      ),
    };
  };

  const settleRow = async (rowId: string, body: Record<string, unknown>) => {
    const fresh = await options.getRow(rowId).catch(() => undefined);
    replaceRow(rowId, (row) => fresh ?? ({ ...row, ...body } as T));
  };

  const write = async (
    rowId: string,
    columnId: string,
    body: Record<string, unknown>,
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
    void options.onSaved();
  };

  const isRefusedElsewhere = (error: unknown, fieldId: string): boolean => {
    const { fields } = resolveFieldErrors(error, { fields: formFieldIds });
    return (
      fields.length > 0 && !fields.some((entry) => entry.field === fieldId)
    );
  };

  const commitCell = async (cell: ActiveInlineEdit): Promise<boolean> => {
    const key = cellKey(cell.rowId, cell.columnId);
    if (pending.value[key]) return false;
    const column = columnOf(cell.columnId);
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
  const toggle = async (
    row: T,
    columnId: string,
    value: unknown,
  ): Promise<boolean> => {
    const column = columnOf(columnId);
    const rowId = rowIdOf(row);
    if (!column || rowId === undefined || !isCellEditable(row, columnId)) {
      return false;
    }
    if (pending.value[cellKey(rowId, columnId)]) return false;
    const body = changeBody(column, value, stateValue(row, column));
    if (!body) return true;
    try {
      await write(rowId, columnId, body);
      return true;
    } catch (error) {
      options.onError(error);
      return false;
    }
  };

  return {
    columns,
    /** `always`: every editable cell is drawn as its input. */
    inputs:
      typeof options.inlineEdit === "object"
        ? (options.inlineEdit.inputs ?? "hover")
        : "hover",
    columnOf,
    rowLabel,
    isCellEditable,
    isEditing,
    isSaving,
    isInvalid,
    pendingOf,
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
