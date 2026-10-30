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
 * draft kept with the server's message, or with the value stored meanwhile
 * on a conflict).
 */
export type MatrixEditStatus = "pending" | "saving" | "failed";

/** The value stored meanwhile, after a conflict: Overwrite or Discard. */
export interface MatrixEditConflict {
  current: unknown;
}

/** A value committed while the cell's previous write still runs. */
export interface MatrixQueuedValue {
  value: unknown;
}

export interface MatrixEdit {
  rowId: string;
  columnId: string;
  /** The value the edit started from: the "was" of a staged cell. */
  before: unknown;
  after: unknown;
  status: MatrixEditStatus;
  message?: BlockText;
  conflict?: MatrixEditConflict;
  /** Written once the write in flight settles, from the value it wrote. */
  queued?: MatrixQueuedValue;
}

/** A value a cell now holds on the server, to show without a read. */
export type MatrixWrittenValue = Pick<
  MatrixChange,
  "rowId" | "columnId" | "value"
>;

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
  /**
   * Values the server now holds that no returned row shows: a change the
   * answer does not name counts as written, its cell keeping the value sent
   * (after an undo, the value written back).
   */
  onWritten?: (values: MatrixWrittenValue[]) => void;
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

const keyOf = (edit: MatrixEdit) => matrixCellKey(edit.rowId, edit.columnId);

/**
 * The change an edit sends. Overwriting a conflict replaces the value stored
 * meanwhile: that is its `previous`, and what an Undo writes back.
 */
const changeOf = (edit: MatrixEdit, isForced = false): MatrixChange => ({
  rowId: edit.rowId,
  columnId: edit.columnId,
  value: edit.after,
  previous: isForced && edit.conflict ? edit.conflict.current : edit.before,
});

/** The refusals of an answer, by cell and by row, and the rows it returns. */
interface AnswerIndex {
  cellErrors: Map<string, BlockText>;
  rowErrors: Map<string, BlockText>;
  conflicts: Map<string, MatrixConflict>;
  returnedRows: Set<string>;
}

function indexAnswer(response: MatrixSaveResponse): AnswerIndex {
  const index: AnswerIndex = {
    cellErrors: new Map(),
    rowErrors: new Map(),
    conflicts: new Map(),
    returnedRows: new Set((response.rows ?? []).map((row) => row.id)),
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

function isRefused(answer: AnswerIndex, change: MatrixWrittenValue): boolean {
  const key = matrixCellKey(change.rowId, change.columnId);
  return (
    answer.cellErrors.has(key) ||
    answer.conflicts.has(key) ||
    answer.rowErrors.has(change.rowId)
  );
}

/** The written values no returned row shows: they are patched on screen. */
function unreturned(
  answer: AnswerIndex,
  values: MatrixWrittenValue[],
): MatrixWrittenValue[] {
  return values
    .filter((value) => !answer.returnedRows.has(value.rowId))
    .map(({ rowId, columnId, value }) => ({ rowId, columnId, value }));
}

export type MatrixSaveEngine = ReturnType<typeof createMatrixSaveEngine>;

type EditOutcome = "saved" | "failed";

/**
 * The edits of a grid and their way to `saveUrl`. `immediate` writes each
 * committed cell at once (Saving, then Saved; a failure keeps the draft with
 * the message, to retry or discard); `staged` keeps them `{ before, after }`
 * until `saveAll` writes them together, and a cell put back as it was is no
 * longer an edit. While a `blockSave` target is missed nothing is written:
 * immediate edits wait, held, and go together once every target is met.
 * A cell has one write at a time: a value committed while it runs waits,
 * then goes from the value it wrote. A conflict is only written over by
 * Overwrite, never by a save of every edit.
 */
export function createMatrixSaveEngine(options: MatrixSaveEngineOptions) {
  const edits = reactive(new Map<string, MatrixEdit>());
  const savedFlash = reactive(new Set<string>());
  const rowErrors = reactive(new Map<string, BlockText>());
  /** Rows edited in this view, kept on screen with `keepEditedRows`. */
  const touchedRows = reactive(new Set<string>());
  const lastSaved = ref<MatrixChange[]>([]);
  /** The writes running, by cell: an undo of that cell waits for them. */
  const inFlight = new Map<string, Promise<unknown>>();
  const flashMs = options.savedFlashMs ?? DEFAULT_SAVED_FLASH_MS;

  const editOf = (rowId: string, columnId: string) =>
    edits.get(matrixCellKey(rowId, columnId));
  const isCurrent = (edit: MatrixEdit) => edits.get(keyOf(edit)) === edit;

  /** The value a cell shows: its edit's (a queued one first), else the server's. */
  function valueOf(rowId: string, columnId: string, stored: unknown): unknown {
    const edit = editOf(rowId, columnId);
    if (!edit) return stored;
    return edit.queued ? edit.queued.value : edit.after;
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
  /** An edit a save may send: not in flight, and no conflict to settle. */
  const isSendable = (edit: MatrixEdit) =>
    edit.status !== "saving" && !edit.conflict;

  async function send(batch: MatrixEdit[], isForced = false): Promise<boolean> {
    if (!batch.length) return true;
    const request: MatrixSaveRequest = {
      changes: batch.map((edit) => changeOf(edit, isForced)),
      ...(isForced && { force: true }),
    };
    for (const edit of batch) {
      edit.status = "saving";
      edit.message = undefined;
    }
    let response: MatrixSaveResponse;
    try {
      response = (await track(request.changes, options.send(request))) ?? {};
    } catch (error) {
      failAll(batch, options.describeError(error));
      return false;
    }
    options.onResponse?.(response);
    const isWritten = settle(batch, request.changes, indexAnswer(response));
    if (options.mode() === "immediate") void flush();
    return isWritten;
  }

  /** Runs a request, known as running for each cell it writes. */
  function track<T>(changes: MatrixWrittenValue[], request: Promise<T>) {
    const keys = changes.map((change) =>
      matrixCellKey(change.rowId, change.columnId),
    );
    const settled = request.catch(() => undefined);
    for (const key of keys) inFlight.set(key, settled);
    void settled.then(() => {
      for (const key of keys) {
        if (inFlight.get(key) === settled) inFlight.delete(key);
      }
    });
    return request;
  }

  /** Resolves once no write of these cells runs any more. */
  async function settledCells(changes: MatrixWrittenValue[]): Promise<void> {
    const running = changes
      .map((change) =>
        inFlight.get(matrixCellKey(change.rowId, change.columnId)),
      )
      .filter((promise): promise is Promise<unknown> => promise !== undefined);
    if (running.length) await Promise.all(running);
  }

  /** A request that failed as a whole: every change keeps its draft. */
  function failAll(batch: MatrixEdit[], message: BlockText): void {
    for (const edit of batch) markFailed(edit, { message });
  }

  /** A value committed during a write that failed becomes the draft. */
  function takeQueued(edit: MatrixEdit): void {
    if (!edit.queued) return;
    edit.after = edit.queued.value;
    edit.queued = undefined;
  }

  function settle(
    batch: MatrixEdit[],
    changes: MatrixChange[],
    answer: AnswerIndex,
  ): boolean {
    const saved: MatrixChange[] = [];
    batch.forEach((edit, index) => {
      if (settleEdit(edit, answer) === "saved")
        saved.push(changes[index] as MatrixChange);
    });
    if (saved.length) {
      lastSaved.value = saved;
      options.onWritten?.(unreturned(answer, saved));
      options.onSaved?.(saved);
    }
    return saved.length === batch.length;
  }

  function settleEdit(edit: MatrixEdit, answer: AnswerIndex): EditOutcome {
    const key = keyOf(edit);
    const conflict = answer.conflicts.get(key);
    const message =
      answer.cellErrors.get(key) ?? answer.rowErrors.get(edit.rowId);
    if (conflict) {
      options.onConflict?.(conflict);
      markFailed(edit, { conflict: { current: conflict.current } });
      return "failed";
    }
    if (message !== undefined) {
      if (answer.rowErrors.has(edit.rowId)) rowErrors.set(edit.rowId, message);
      markFailed(edit, { message });
      return "failed";
    }
    rowErrors.delete(edit.rowId);
    if (isCurrent(edit)) settleWritten(edit, key);
    return "saved";
  }

  /** A written edit: gone, or followed by the value committed meanwhile. */
  function settleWritten(edit: MatrixEdit, key: string): void {
    edits.delete(key);
    const queued = edit.queued;
    if (!queued || isSameValue(queued.value, edit.after)) {
      flashSaved(key);
      return;
    }
    edits.set(key, {
      rowId: edit.rowId,
      columnId: edit.columnId,
      before: edit.after,
      after: queued.value,
      status: "pending",
    });
  }

  function markFailed(
    edit: MatrixEdit,
    failure: Pick<MatrixEdit, "message" | "conflict">,
  ): void {
    if (!isCurrent(edit)) return;
    takeQueued(edit);
    edit.status = "failed";
    edit.message = failure.message;
    edit.conflict = failure.conflict ?? edit.conflict;
  }

  /** Writes the immediate edits held so far, unless a target holds them. */
  function flush(): Promise<boolean> {
    if (options.isBlocked()) return Promise.resolve(false);
    return send(
      list.value.filter(
        (edit) => edit.status === "pending" && isSendable(edit),
      ),
    );
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
    touchedRows.add(change.rowId);
    if (existing?.status === "saving") {
      existing.queued = { value: change.value };
      return;
    }
    const before = existing ? existing.before : change.original;
    if (isSameValue(change.value, before) && !existing?.conflict) {
      if (existing) edits.delete(key);
      return;
    }
    const conflict = existing?.conflict;
    edits.set(key, {
      rowId: change.rowId,
      columnId: change.columnId,
      before,
      after: change.value,
      status: conflict ? "failed" : "pending",
      ...(conflict && { conflict }),
    });
  }

  /** Writes every edit that may go (the save bar, Ctrl+S); conflicts wait. */
  function saveAll(): Promise<boolean> {
    if (options.isBlocked()) return Promise.resolve(false);
    return send(list.value.filter(isSendable));
  }

  /** Writes one failed cell again. */
  function retry(rowId: string, columnId: string): Promise<boolean> {
    const edit = editOf(rowId, columnId);
    if (!edit || !isSendable(edit) || options.isBlocked())
      return Promise.resolve(false);
    return send([edit]);
  }

  /** Writes a conflicting cell over the value stored meanwhile. */
  function overwrite(rowId: string, columnId: string): Promise<boolean> {
    const edit = editOf(rowId, columnId);
    if (!edit || edit.status === "saving" || options.isBlocked())
      return Promise.resolve(false);
    return send([edit], true);
  }

  /** Drops a cell's edit: it shows what the server holds. */
  function discard(rowId: string, columnId: string): void {
    const key = matrixCellKey(rowId, columnId);
    const edit = edits.get(key);
    if (!edit) return;
    if (edit.status === "saving") {
      edit.queued = undefined;
      return;
    }
    edits.delete(key);
  }

  /** Drops every edit not being written. */
  function discardAll(): void {
    for (const [key, edit] of edits) {
      if (edit.status === "saving") edit.queued = undefined;
      else edits.delete(key);
    }
    rowErrors.clear();
  }

  /**
   * Writes back the values the last save replaced (its `previous`), as the
   * Undo of its toast. Resolves whether the route took them all.
   */
  async function undo(changes: MatrixChange[]): Promise<boolean> {
    if (!changes.length) return true;
    await settledCells(changes);
    const request: MatrixSaveRequest = {
      changes: changes.map((change) => ({
        rowId: change.rowId,
        columnId: change.columnId,
        value: change.previous,
        previous: change.value,
      })),
    };
    let response: MatrixSaveResponse;
    try {
      response = (await track(request.changes, options.send(request))) ?? {};
    } catch {
      return false;
    }
    options.onResponse?.(response);
    const answer = indexAnswer(response);
    const written = request.changes.filter(
      (change) => !isRefused(answer, change),
    );
    options.onWritten?.(unreturned(answer, written));
    return written.length === request.changes.length;
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
