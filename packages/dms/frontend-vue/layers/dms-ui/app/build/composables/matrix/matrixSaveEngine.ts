import { computed, reactive, ref, type ComputedRef } from "vue";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  MatrixChange,
  MatrixConflict,
  MatrixSaveMode,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "../../../types/matrix";
import { isSameValue } from "./matrixValues";

/**
 * An edited cell not written yet: `pending` (staged, or held in immediate
 * mode while a `blockSave` target is missed), `saving`, or `failed` (the
 * draft kept with the server's message, or the value it holds now on a
 * conflict).
 */
export type MatrixEditStatus = "pending" | "saving" | "failed";

export interface MatrixEdit {
  rowId: string;
  columnId: string;
  /** The value the edit started from: the "was" of a staged cell. */
  before: unknown;
  after: unknown;
  status: MatrixEditStatus;
  message?: BlockText;
  /** The value stored meanwhile, after a conflict: Overwrite or Discard. */
  conflict?: { current: unknown };
}

/** What a cell shows of its saving. */
export type MatrixCellSaveState =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export interface MatrixSaveEngineOptions {
  mode: () => MatrixSaveMode;
  /** Posts a request to `saveUrl`; rejects on a non-2xx answer. */
  send: (request: MatrixSaveRequest) => Promise<MatrixSaveResponse | null>;
  /** A missed target refuses the writes (`blockSave`), edits included. */
  isBlocked: () => boolean;
  /** Every answer of `saveUrl`: its rows, counts and targets go on screen. */
  onResponse?: (response: MatrixSaveResponse) => void;
  /** A change the server answered a conflict for. */
  onConflict?: (conflict: MatrixConflict) => void;
  /** The changes a request wrote (some of them, or all). */
  onSaved?: (changes: MatrixChange[]) => void;
  /** The message a failed request leaves in its cells. */
  describeError: (error: unknown) => BlockText;
  /** How long a written cell says "Saved". */
  savedFlashMs?: number;
}

/** What a cell commits. */
export interface MatrixCommit {
  rowId: string;
  columnId: string;
  value: unknown;
  /** The value the server holds, the edit's start when it has none yet. */
  original: unknown;
}

const DEFAULT_SAVED_FLASH_MS = 1800;
const KEY_SEPARATOR = "\u0001";

export function matrixCellKey(rowId: string, columnId: string): string {
  return `${rowId}${KEY_SEPARATOR}${columnId}`;
}

const changeOf = (edit: MatrixEdit): MatrixChange => ({
  rowId: edit.rowId,
  columnId: edit.columnId,
  value: edit.after,
  previous: edit.before,
});

/** The refusals of an answer, by cell and by row. */
interface AnswerIndex {
  cellErrors: Map<string, BlockText>;
  rowErrors: Map<string, BlockText>;
  conflicts: Map<string, MatrixConflict>;
}

function indexAnswer(response: MatrixSaveResponse): AnswerIndex {
  const index: AnswerIndex = {
    cellErrors: new Map(),
    rowErrors: new Map(),
    conflicts: new Map(),
  };
  for (const error of response.errors ?? []) {
    if (error.columnId)
      index.cellErrors.set(
        matrixCellKey(error.rowId, error.columnId),
        error.message,
      );
    else index.rowErrors.set(error.rowId, error.message);
  }
  for (const conflict of response.conflicts ?? []) {
    index.conflicts.set(
      matrixCellKey(conflict.rowId, conflict.columnId),
      conflict,
    );
  }
  return index;
}

export type MatrixSaveEngine = ReturnType<typeof createMatrixSaveEngine>;

/**
 * The edits of a grid and their way to `saveUrl`. `immediate` writes each
 * committed cell at once (Saving, then Saved; a failure keeps the draft with
 * the message, to retry or discard); `staged` keeps them `{ before, after }`
 * until `saveAll` writes them together, and a cell put back as it was is no
 * longer an edit. While a `blockSave` target is missed nothing is written:
 * immediate edits wait, held, and go together once every target is met.
 */
export function createMatrixSaveEngine(options: MatrixSaveEngineOptions) {
  const edits = reactive(new Map<string, MatrixEdit>());
  const savedFlash = reactive(new Set<string>());
  const rowErrors = reactive(new Map<string, BlockText>());
  /** Rows edited in this view, kept on screen with `keepEditedRows`. */
  const touchedRows = reactive(new Set<string>());
  const lastSaved = ref<MatrixChange[]>([]);
  const flashMs = options.savedFlashMs ?? DEFAULT_SAVED_FLASH_MS;

  const editOf = (rowId: string, columnId: string) =>
    edits.get(matrixCellKey(rowId, columnId));

  /** The value a cell shows: its edit's, else what the server holds. */
  function valueOf(rowId: string, columnId: string, stored: unknown): unknown {
    const edit = editOf(rowId, columnId);
    return edit ? edit.after : stored;
  }

  function stateOf(rowId: string, columnId: string): MatrixCellSaveState {
    const key = matrixCellKey(rowId, columnId);
    const edit = edits.get(key);
    if (!edit) return savedFlash.has(key) ? "saved" : "idle";
    if (edit.status === "failed") return edit.conflict ? "conflict" : "error";
    return edit.status;
  }

  function flashSaved(key: string): void {
    savedFlash.add(key);
    setTimeout(() => savedFlash.delete(key), flashMs);
  }

  const list = computed(() => [...edits.values()]);
  const waiting = (edit: MatrixEdit) => edit.status !== "saving";

  async function send(batch: MatrixEdit[], force = false): Promise<boolean> {
    if (!batch.length) return true;
    for (const edit of batch) {
      edit.status = "saving";
      edit.message = undefined;
      edit.conflict = undefined;
    }
    const request: MatrixSaveRequest = {
      changes: batch.map(changeOf),
      ...(force && { force: true }),
    };
    let response: MatrixSaveResponse;
    try {
      response = (await options.send(request)) ?? {};
    } catch (error) {
      failAll(batch, options.describeError(error));
      return false;
    }
    options.onResponse?.(response);
    return settle(batch, indexAnswer(response));
  }

  /** A request that failed as a whole: every change keeps its draft. */
  function failAll(batch: MatrixEdit[], message: BlockText): void {
    for (const edit of batch) {
      if (edits.get(matrixCellKey(edit.rowId, edit.columnId)) !== edit)
        continue;
      edit.status = "failed";
      edit.message = message;
    }
  }

  function settle(batch: MatrixEdit[], answer: AnswerIndex): boolean {
    const saved: MatrixChange[] = [];
    let failures = 0;
    for (const edit of batch) {
      const outcome = settleEdit(edit, answer);
      if (outcome === "failed") failures++;
      if (outcome === "saved") saved.push(changeOf(edit));
    }
    if (saved.length) {
      lastSaved.value = saved;
      options.onSaved?.(saved);
    }
    return failures === 0;
  }

  function settleEdit(
    edit: MatrixEdit,
    answer: AnswerIndex,
  ): "saved" | "failed" {
    const key = matrixCellKey(edit.rowId, edit.columnId);
    const conflict = answer.conflicts.get(key);
    const message =
      answer.cellErrors.get(key) ?? answer.rowErrors.get(edit.rowId);
    if (conflict) {
      options.onConflict?.(conflict);
      // The stored value is what an Overwrite now replaces.
      markFailed(edit, key, { conflict: { current: conflict.current } });
      return "failed";
    }
    if (message !== undefined) {
      if (answer.rowErrors.has(edit.rowId)) rowErrors.set(edit.rowId, message);
      markFailed(edit, key, { message });
      return "failed";
    }
    rowErrors.delete(edit.rowId);
    const current = edits.get(key);
    if (current === edit) {
      edits.delete(key);
      flashSaved(key);
    } else if (current) {
      // Edited again while this write ran: the next write starts from it.
      current.before = edit.after;
    }
    return "saved";
  }

  function markFailed(
    edit: MatrixEdit,
    key: string,
    failure: Pick<MatrixEdit, "message" | "conflict">,
  ): void {
    if (edits.get(key) !== edit) return;
    edit.status = "failed";
    edit.message = failure.message;
    edit.conflict = failure.conflict;
    if (failure.conflict) edit.before = failure.conflict.current;
  }

  /** Writes the immediate edits held so far, unless a target holds them. */
  function flush(): Promise<boolean> {
    if (options.isBlocked()) return Promise.resolve(false);
    return send(list.value.filter((edit) => edit.status === "pending"));
  }

  /**
   * A cell's new value. Staged, it becomes an edit (or stops being one when
   * put back as it was); immediate, it is written at once.
   */
  function commit(change: MatrixCommit): Promise<boolean> {
    return commitMany([change]);
  }

  /** Several cells at once (a fill action): one write in immediate mode. */
  function commitMany(changes: MatrixCommit[]): Promise<boolean> {
    changes.forEach(record);
    return options.mode() === "immediate" ? flush() : Promise.resolve(true);
  }

  /** Records a cell's new value as its edit, or drops the edit it undoes. */
  function record(change: MatrixCommit): void {
    const key = matrixCellKey(change.rowId, change.columnId);
    const existing = edits.get(key);
    const before = existing ? existing.before : change.original;
    touchedRows.add(change.rowId);
    if (isSameValue(change.value, before)) {
      if (existing && existing.status !== "saving") edits.delete(key);
      return;
    }
    edits.set(key, {
      rowId: change.rowId,
      columnId: change.columnId,
      before,
      after: change.value,
      status: "pending",
    });
  }

  /** Writes every edit not being written (the save bar, Ctrl+S). */
  function saveAll(): Promise<boolean> {
    if (options.isBlocked()) return Promise.resolve(false);
    return send(list.value.filter(waiting));
  }

  /** Writes one failed cell again. */
  function retry(rowId: string, columnId: string): Promise<boolean> {
    const edit = editOf(rowId, columnId);
    if (!edit || edit.status === "saving") return Promise.resolve(false);
    if (options.isBlocked()) return Promise.resolve(false);
    return send([edit]);
  }

  /** Writes a conflicting cell over the value stored meanwhile. */
  function overwrite(rowId: string, columnId: string): Promise<boolean> {
    const edit = editOf(rowId, columnId);
    if (!edit || edit.status === "saving") return Promise.resolve(false);
    return send([edit], true);
  }

  /** Drops a cell's edit: it shows what the server holds. */
  function discard(rowId: string, columnId: string): void {
    const key = matrixCellKey(rowId, columnId);
    if (edits.get(key)?.status === "saving") return;
    edits.delete(key);
  }

  /** Drops every edit not being written. */
  function discardAll(): void {
    for (const [key, edit] of edits) {
      if (waiting(edit)) edits.delete(key);
    }
    rowErrors.clear();
  }

  /**
   * Writes back the values the last save replaced (its `previous`), as the
   * Undo of its toast. Resolves whether the route took them.
   */
  async function undo(changes: MatrixChange[]): Promise<boolean> {
    if (!changes.length) return true;
    const request: MatrixSaveRequest = {
      changes: changes.map((change) => ({
        rowId: change.rowId,
        columnId: change.columnId,
        value: change.previous,
        previous: change.value,
      })),
    };
    try {
      const response = (await options.send(request)) ?? {};
      options.onResponse?.(response);
      const answer = indexAnswer(response);
      return (
        answer.cellErrors.size +
          answer.rowErrors.size +
          answer.conflicts.size ===
        0
      );
    } catch {
      return false;
    }
  }

  const count: ComputedRef<number> = computed(() => edits.size);
  const isSaving = computed(() =>
    list.value.some((edit) => edit.status === "saving"),
  );
  const failedCount = computed(
    () => list.value.filter((edit) => edit.status === "failed").length,
  );
  /** Immediate edits held by a missed `blockSave` target. */
  const heldCount = computed(() =>
    options.mode() === "immediate"
      ? list.value.filter((edit) => edit.status === "pending").length
      : 0,
  );

  return {
    edits: list,
    count,
    isSaving,
    failedCount,
    heldCount,
    /** Unsaved work the page must not lose: an edit, held, staged or failed. */
    hasUnsaved: computed(() => edits.size > 0),
    rowErrors,
    touchedRows,
    lastSaved,
    editOf,
    valueOf,
    stateOf,
    commit,
    commitMany,
    flush,
    saveAll,
    retry,
    overwrite,
    discard,
    discardAll,
    undo,
  };
}
