import { computed, reactive, toRaw, type ComputedRef } from "vue";
import type {
  AgendaChange,
  AgendaConfirm,
  AgendaEvent,
  AgendaSaveError,
  AgendaSaveMode,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../../../types/full-agenda";
import {
  agendaEditKey,
  mergeChanges,
  type AgendaEdit,
  type AgendaGhost,
} from "./agendaChanges";
import { answeredIds, readdressQueued } from "./agendaQueue";

/** What a save request carries besides its changes. */
export type AgendaRequestContext = Omit<
  AgendaSaveRequest,
  "changes" | "force" | "overwrite"
>;

export interface AgendaSaveEngineOptions {
  mode: () => AgendaSaveMode;
  /** Posts a request to `saveUrl`; rejects on a non-2xx answer. */
  send: (request: AgendaSaveRequest) => Promise<AgendaSaveResponse | null>;
  /** The conflicts mode, range and view the request carries. */
  context: () => AgendaRequestContext;
  /** Asks what a `confirm` answer asks; resolves whether the user went on. */
  confirm: (confirm: AgendaConfirm) => Promise<boolean>;
  /**
   * Puts an answer on screen: its events and removals, its lists, and the
   * changes it wrote (`written`) that it answers no event for, as sent.
   */
  onAnswer: (response: AgendaSaveResponse, written: AgendaChange[]) => void;
  /** The changes a request wrote, with its answer (Undo, its message). */
  onSaved?: (written: AgendaChange[], response: AgendaSaveResponse) => void;
  /**
   * Changes refused, with their message. In immediate mode they are no
   * longer kept: the event is back where it was, and `resend` writes one
   * again (the toast's Retry).
   */
  onFailed?: (edits: AgendaEdit[]) => void;
  /** A change the route answered a conflict for. */
  onConflict?: (edit: AgendaEdit) => void;
  /** Changes of events the route no longer has (`notFound`): they are removed. */
  onGone?: (edits: AgendaEdit[]) => void;
  /** The message a request that failed as a whole leaves. */
  describeError: (error: unknown) => string;
  /** A message of the answer as text. */
  text: (message: AgendaSaveError["message"]) => string;
}

/** What a change brings besides itself. */
export interface AgendaRecordExtras {
  /** The event a new one draws as (`create`, `schedule`). */
  seed?: AgendaEvent;
  /** The event before the change. */
  base?: AgendaEvent;
  /** Where the occurrence was. */
  ghost?: AgendaGhost;
}

/** What the user answered for a request: a `confirm` question (`force`), a conflict (`overwrite`). */
interface WriteFlags {
  force?: boolean;
  overwrite?: boolean;
}

/** The answer's refusals, by the place of their change in the request. */
const errorsByIndex = (response: AgendaSaveResponse) =>
  new Map((response.errors ?? []).map((error) => [error.index, error]));

const flagsOf = (flags: WriteFlags) => ({
  ...(flags.force && { force: true }),
  ...(flags.overwrite && { overwrite: true }),
});

/** How the changes of one request came back. */
interface AgendaSettled {
  written: AgendaChange[];
  failed: AgendaEdit[];
  gone: AgendaEdit[];
}

/**
 * The changes of an agenda on their way to `saveUrl`. `immediate` writes each
 * change at once, drawn at its new place meanwhile; refused, it is dropped
 * (the event is back where it was) and handed to `onFailed` for a Retry.
 * `staged` keeps them, merged per event, until `saveAll` writes them
 * together. An event has one write at a time: a change made while it runs
 * waits, then goes, addressed to the id the route answered. A `confirm`
 * answer asks the user, then posts the same changes again with `force`
 * (asked twice, it is a refusal); a conflict is written over with
 * `overwrite`, or discarded for the route's version.
 */
export class AgendaSaveEngine {
  private readonly map = reactive(new Map<string, AgendaEdit>());
  /** The writes running, by edit key: an Undo of that event waits for them. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /** Every change not written yet, in the order made. */
  readonly edits: ComputedRef<AgendaEdit[]> = computed(() => [
    ...this.map.values(),
  ]);
  readonly count = computed(() => this.map.size);
  readonly isSaving = computed(() =>
    this.edits.value.some((edit) => edit.status === "saving"),
  );
  /** What a Save writes: the staged and refused changes, conflicts aside. */
  readonly sendable = computed(() =>
    this.edits.value.filter(
      (edit) => edit.status === "staged" || edit.status === "error",
    ),
  );
  /**
   * Changes the page must not lose: in staged mode every one not being
   * written. In immediate mode nothing waits for a Save.
   */
  readonly hasUnsaved = computed(
    () =>
      this.options.mode() === "staged" &&
      this.edits.value.some((edit) => edit.status !== "saving"),
  );
  /** The changes not being written, as a save would send them. */
  readonly staged = computed(() =>
    this.edits.value
      .filter((edit) => edit.status !== "saving")
      .map((edit) => edit.change),
  );

  constructor(private readonly options: AgendaSaveEngineOptions) {}

  editOf(key: string): AgendaEdit | undefined {
    return this.map.get(key);
  }

  private isCurrent(edit: AgendaEdit): boolean {
    return this.map.get(edit.key) === edit;
  }

  private get isImmediate(): boolean {
    return this.options.mode() === "immediate";
  }

  /**
   * Records a change: merged into the event's edit (dropped when they cancel
   * out), queued behind a write running, written at once in immediate mode
   * (a change of an event in conflict too: the route checks it again).
   * Resolves whether it was written (or kept, staged).
   */
  record(
    change: AgendaChange,
    extras: AgendaRecordExtras = {},
  ): Promise<boolean> {
    const key = agendaEditKey(change);
    const existing = this.map.get(key);
    if (existing?.status === "saving") {
      existing.queued = existing.queued
        ? (mergeChanges(existing.queued, change) ?? undefined)
        : change;
      return Promise.resolve(true);
    }
    const merged = existing ? mergeChanges(existing.change, change) : change;
    if (!merged) {
      this.map.delete(key);
      return Promise.resolve(true);
    }
    const keepsConflict = existing?.status === "conflict" && !this.isImmediate;
    this.map.set(key, {
      key,
      change: merged,
      status: keepsConflict ? "conflict" : "staged",
      seed: existing?.seed ?? extras.seed,
      base: existing?.base ?? extras.base,
      ghost: existing?.ghost ?? extras.ghost,
      current: keepsConflict ? existing?.current : undefined,
    });
    if (!this.isImmediate) return Promise.resolve(true);
    // The map hands back its reactive copy: the one the engine compares.
    return this.send([this.map.get(key)!]);
  }

  /** Writes a change refused in immediate mode again (the toast's Retry). */
  resend(edit: AgendaEdit): Promise<boolean> {
    return this.record(edit.change, edit);
  }

  /** Runs a request, known as running for each edit it writes. */
  private track<T>(keys: string[], request: Promise<T>): Promise<T> {
    const settled = request.catch(() => undefined);
    for (const key of keys) this.inFlight.set(key, settled);
    void settled.then(() => {
      for (const key of keys)
        if (this.inFlight.get(key) === settled) this.inFlight.delete(key);
    });
    return request;
  }

  private async settledKeys(keys: string[]): Promise<void> {
    const running = keys
      .map((key) => this.inFlight.get(key))
      .filter((promise): promise is Promise<unknown> => promise !== undefined);
    if (running.length) await Promise.all(running);
  }

  private async send(
    batch: AgendaEdit[],
    flags: WriteFlags = {},
  ): Promise<boolean> {
    if (!batch.length) return true;
    const request: AgendaSaveRequest = {
      ...this.options.context(),
      changes: batch.map((edit) => edit.change),
      ...flagsOf(flags),
    };
    for (const edit of batch) {
      edit.status = "saving";
      edit.message = undefined;
    }
    let response: AgendaSaveResponse;
    try {
      response =
        (await this.track(
          batch.map((edit) => edit.key),
          this.options.send(request),
        )) ?? {};
    } catch (error) {
      this.fail(batch, this.options.describeError(error));
      return false;
    }
    if (response.confirm)
      return this.answerConfirm(batch, response.confirm, flags);
    return this.settle(batch, response);
  }

  /** Changes refused as a whole: told, then dropped (immediate) or kept (staged). */
  private fail(batch: AgendaEdit[], message: string): void {
    const failed = batch
      .filter((edit) => this.isCurrent(edit))
      .map((edit) => this.markFailed(edit, message));
    if (failed.length) this.options.onFailed?.(failed);
  }

  /**
   * A `confirm` answer wrote nothing: asked, the changes go again with
   * `force`, or go back. Asked again under `force`, it is a refusal: the
   * route would ask forever.
   */
  private async answerConfirm(
    batch: AgendaEdit[],
    confirm: AgendaConfirm,
    flags: WriteFlags,
  ): Promise<boolean> {
    const current = batch.filter((edit) => this.isCurrent(edit));
    if (flags.force) {
      this.fail(current, this.options.text(confirm.title));
      return false;
    }
    if (await this.options.confirm(confirm))
      return this.send(current, { ...flags, force: true });
    for (const edit of current) {
      if (this.isImmediate) this.map.delete(edit.key);
      else edit.status = "staged";
    }
    return false;
  }

  /** Sorts the changes of a request by how the answer took them. */
  private sortAnswer(
    batch: AgendaEdit[],
    response: AgendaSaveResponse,
  ): AgendaSettled {
    const errors = errorsByIndex(response);
    const settled: AgendaSettled = { written: [], failed: [], gone: [] };
    batch.forEach((edit, index) => {
      const error = errors.get(index);
      if (!error) settled.written.push(edit.change);
      else if (error.code === "notFound") settled.gone.push(edit);
      else if (error.code === "conflict") this.markConflict(edit, error);
      else if (this.isCurrent(edit))
        settled.failed.push(
          this.markFailed(edit, this.options.text(error.message)),
        );
    });
    return settled;
  }

  private settle(batch: AgendaEdit[], response: AgendaSaveResponse): boolean {
    const errors = errorsByIndex(response);
    const { written, failed, gone } = this.sortAnswer(batch, response);
    const goneIds = gone.map((edit) => edit.change.id ?? edit.key);
    this.options.onAnswer(
      { ...response, removed: [...(response.removed ?? []), ...goneIds] },
      written,
    );
    const ids = answeredIds(written, response);
    batch.forEach((edit, index) => {
      const error = errors.get(index);
      if (!error || error.code === "notFound") this.settleWritten(edit, ids);
    });
    if (written.length) this.options.onSaved?.(written, response);
    if (failed.length) this.options.onFailed?.(failed);
    if (gone.length) this.options.onGone?.(gone);
    return written.length === batch.length;
  }

  private markConflict(edit: AgendaEdit, error: AgendaSaveError): void {
    if (!this.isCurrent(edit)) return;
    this.takeQueued(edit);
    edit.status = "conflict";
    edit.message = this.options.text(error.message);
    edit.current = error.current;
    this.options.onConflict?.(edit);
  }

  /** A change written: gone, or followed by the change made meanwhile, addressed to the answered id. */
  private settleWritten(edit: AgendaEdit, ids: Map<string, string>): void {
    if (!this.isCurrent(edit)) return;
    this.map.delete(edit.key);
    const queued = readdressQueued(edit, ids);
    if (!queued) return;
    void this.record(queued, { base: edit.base, ghost: edit.ghost });
  }

  /** A change made during a write that failed joins the change kept. */
  private takeQueued(edit: AgendaEdit): void {
    if (!edit.queued) return;
    const merged = mergeChanges(edit.change, edit.queued);
    edit.queued = undefined;
    if (merged) edit.change = merged;
  }

  /**
   * A refused change, as told: in immediate mode no longer kept (the event
   * is drawn back; a Retry resends the copy), in staged mode kept for the
   * next Save.
   */
  private markFailed(edit: AgendaEdit, message: string): AgendaEdit {
    this.takeQueued(edit);
    edit.status = "error";
    edit.message = message;
    if (!this.isImmediate) return edit;
    this.map.delete(edit.key);
    return { ...toRaw(edit) };
  }

  /** Writes every staged or refused change, the conflicts aside (the save bar, Ctrl+S). */
  saveAll(): Promise<boolean> {
    return this.send(this.sendable.value);
  }

  /** Writes a refused change again (staged mode; immediate refusals use `resend`). */
  retry(key: string): Promise<boolean> {
    const edit = this.map.get(key);
    if (!edit || edit.status !== "error") return Promise.resolve(false);
    return this.send([edit]);
  }

  /** Writes a conflicting change over what the route stores (`overwrite`). */
  overwrite(key: string): Promise<boolean> {
    const edit = this.map.get(key);
    if (!edit || edit.status !== "conflict") return Promise.resolve(false);
    return this.send([edit], { overwrite: true });
  }

  /** Drops a change; after a conflict, the route's version is shown. */
  discard(key: string): void {
    const edit = this.map.get(key);
    if (!edit || edit.status === "saving") return;
    this.map.delete(key);
    if (edit.current) this.options.onAnswer({ events: [edit.current] }, []);
  }

  /** Drops every change not being written. */
  discardAll(): void {
    for (const key of this.map.keys()) this.discard(key);
  }

  /**
   * Writes `changes` at once, apart from the edits (an Undo), after any
   * write of the same events still running; a `confirm` answer is asked
   * once. Resolves whether the route took them all.
   */
  async writeNow(changes: AgendaChange[], force = false): Promise<boolean> {
    if (!changes.length) return true;
    const keys = changes.map(agendaEditKey);
    await this.settledKeys(keys);
    const request: AgendaSaveRequest = {
      ...this.options.context(),
      changes,
      ...flagsOf({ force }),
    };
    let response: AgendaSaveResponse;
    try {
      response = (await this.track(keys, this.options.send(request))) ?? {};
    } catch {
      return false;
    }
    if (response.confirm) {
      if (force || !(await this.options.confirm(response.confirm)))
        return false;
      return this.writeNow(changes, true);
    }
    const errors = errorsByIndex(response);
    const written = changes.filter((_change, index) => !errors.has(index));
    this.options.onAnswer(response, written);
    return written.length === changes.length;
  }
}

/** A save engine for an agenda (see {@link AgendaSaveEngine}). */
export function createAgendaSaveEngine(
  options: AgendaSaveEngineOptions,
): AgendaSaveEngine {
  return new AgendaSaveEngine(options);
}
