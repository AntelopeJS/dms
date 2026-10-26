import { computed, reactive, toRaw, type ComputedRef } from "vue";
import type {
  AgendaChange,
  AgendaConfirm,
  AgendaEvent,
  AgendaSaveError,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../../../types/full-agenda";
import { agendaEditKey, mergeChanges, type AgendaEdit } from "./agendaChanges";
import type {
  AgendaRecordExtras,
  AgendaRequestContext,
  AgendaSaveEngineOptions,
} from "./agendaSaveOptions";

export type {
  AgendaRecordExtras,
  AgendaRequestContext,
  AgendaSaveEngineOptions,
} from "./agendaSaveOptions";
import {
  afterRefused,
  answeredIds,
  isUnaddressed,
  makesNewEvent,
  readdressQueued,
} from "./agendaQueue";
import { seriesTimeZone } from "./agendaSeries";
import { AgendaInFlight } from "./agendaInFlight";

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
  private readonly inFlight = new AgendaInFlight();

  /** Undos being written (`writeNow`), apart from the edits. */
  private readonly writing = reactive({ count: 0 });
  /** An Undo is being written. */
  readonly isWritingNow = computed(() => this.writing.count > 0);

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
   * written, and one made during a Save. In immediate mode nothing waits
   * for a Save.
   */
  readonly hasUnsaved = computed(
    () =>
      this.options.mode() === "staged" &&
      this.edits.value.some(
        (edit) => edit.status !== "saving" || Boolean(edit.queued),
      ),
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

  /** The zone two changes of an edit's event merge in: its series', else the agenda's. */
  private zoneOf(base: AgendaEvent | undefined): string {
    const zone = this.options.timeZone?.() ?? "UTC";
    return base ? seriesTimeZone(base, zone) : zone;
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
    /**
     * Sent behind the write of the event that just settled: it goes at
     * once (that write still counts as running for a moment), so an Undo
     * waiting for the event waits for it too.
     */
    followsWrite = false,
  ): Promise<boolean> {
    const key = agendaEditKey(change);
    const existing = this.map.get(key);
    const zone = this.zoneOf(existing?.base ?? extras.base);
    if (existing?.status === "saving") {
      this.queueBehind(existing, change, zone);
      return Promise.resolve(true);
    }
    const merged = existing
      ? mergeChanges(existing.change, change, zone)
      : change;
    if (!merged) {
      this.map.delete(key);
      return Promise.resolve(true);
    }
    this.map.set(key, this.editOfChange(key, merged, existing, extras));
    if (!this.isImmediate) return Promise.resolve(true);
    // An Undo of this event still running goes first: one write at a time.
    if (!followsWrite && this.inFlight.has(key))
      return this.sendAfterRunning(key);
    // The map hands back its reactive copy: the one the engine compares.
    return this.send([this.map.get(key)!]);
  }

  /** A change made while the event's write runs: it waits, merged with any waiting already. */
  private queueBehind(
    edit: AgendaEdit,
    change: AgendaChange,
    zone: string,
  ): void {
    edit.queued = edit.queued
      ? (mergeChanges(edit.queued, change, zone) ?? undefined)
      : change;
  }

  /** The edit a change makes, taking over what the event's edit held (a staged conflict stays one). */
  private editOfChange(
    key: string,
    change: AgendaChange,
    existing: AgendaEdit | undefined,
    extras: AgendaRecordExtras,
  ): AgendaEdit {
    const keepsConflict = existing?.status === "conflict" && !this.isImmediate;
    return {
      key,
      change,
      status: keepsConflict ? "conflict" : "staged",
      seed: existing?.seed ?? extras.seed,
      base: existing?.base ?? extras.base,
      ghost: existing?.ghost ?? extras.ghost,
      current: keepsConflict ? existing?.current : undefined,
    };
  }

  /** Sends an event's change once the write of it running settles (an Undo). */
  private async sendAfterRunning(key: string): Promise<boolean> {
    await this.inFlight.settled([key]);
    const current = this.map.get(key);
    if (!current || current.status !== "staged") return true;
    return this.send([current]);
  }

  /** Writes a change refused in immediate mode again (the toast's Retry). */
  resend(edit: AgendaEdit): Promise<boolean> {
    return this.record(edit.change, edit);
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
        (await this.inFlight.track(
          batch.map((edit) => edit.key),
          this.options.send(request),
        )) ?? {};
    } catch (error) {
      this.fail(batch, this.options.describeError(error));
      return false;
    }
    if (response.confirm)
      return this.answerConfirm(batch, response.confirm, flags);
    return this.settle(batch, response, flags, request);
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
      if (!this.isImmediate) {
        this.takeQueued(edit);
        edit.status = "staged";
        continue;
      }
      this.map.delete(edit.key);
      // A change made meanwhile is the user's own: it goes on its own, but
      // never to a new event the user declined (the route never knew it).
      if (edit.queued && !makesNewEvent(edit.change))
        void this.record(afterRefused(edit.change, edit.queued), {
          base: edit.base,
        });
    }
    this.options.onDeclined?.();
    return false;
  }

  /** Sorts the changes of a request by how the answer took them. */
  private sortAnswer(
    batch: AgendaEdit[],
    response: AgendaSaveResponse,
    flags: WriteFlags,
  ): AgendaSettled {
    const errors = errorsByIndex(response);
    const settled: AgendaSettled = { written: [], failed: [], gone: [] };
    batch.forEach((edit, index) => {
      const error = errors.get(index);
      if (!error) settled.written.push(edit.change);
      else if (error.code === "notFound") settled.gone.push(edit);
      else if (error.code === "conflict") this.markConflict(edit, error, flags);
      else if (this.isCurrent(edit))
        settled.failed.push(
          this.markFailed(edit, this.options.text(error.message)),
        );
    });
    return settled;
  }

  private settle(
    batch: AgendaEdit[],
    response: AgendaSaveResponse,
    flags: WriteFlags,
    request: AgendaRequestContext,
  ): boolean {
    const errors = errorsByIndex(response);
    const { written, failed, gone } = this.sortAnswer(batch, response, flags);
    const goneIds = gone.map((edit) => edit.change.id ?? edit.key);
    this.options.onAnswer(
      { ...response, removed: [...(response.removed ?? []), ...goneIds] },
      written,
      request,
    );
    const ids = answeredIds(written, response);
    batch.forEach((edit, index) => {
      const error = errors.get(index);
      if (!error) this.settleWritten(edit, ids);
      // An event gone takes the change queued behind it along.
      else if (error.code === "notFound" && this.isCurrent(edit))
        this.map.delete(edit.key);
    });
    if (written.length) this.options.onSaved?.(written, response);
    if (failed.length) this.options.onFailed?.(failed);
    if (gone.length) this.options.onGone?.(gone);
    return written.length === batch.length;
  }

  private markConflict(
    edit: AgendaEdit,
    error: AgendaSaveError,
    flags: WriteFlags,
  ): void {
    if (!this.isCurrent(edit)) return;
    this.takeQueued(edit);
    edit.status = "conflict";
    edit.forced = Boolean(flags.force);
    edit.message = this.options.text(error.message);
    edit.current = error.current;
    this.options.onConflict?.(edit);
  }

  /** A change written: gone, or followed by the change made meanwhile, addressed to the answered id. */
  private settleWritten(edit: AgendaEdit, ids: Map<string, string>): void {
    if (!this.isCurrent(edit)) return;
    this.map.delete(edit.key);
    if (isUnaddressed(edit, ids)) {
      this.failUnaddressed(edit);
      return;
    }
    const queued = readdressQueued(edit, ids);
    if (!queued) return;
    void this.record(queued, { base: edit.base, ghost: edit.ghost }, true);
  }

  /** A change queued behind a new event the route gave no id: told, not sent. */
  private failUnaddressed(edit: AgendaEdit): void {
    const change = edit.queued!;
    this.options.onFailed?.([
      {
        key: agendaEditKey(change),
        change,
        status: "error",
        base: edit.base,
        message: this.options.unaddressed?.() ?? "",
        // Nothing to retry: the route never named the event.
        retryable: false,
      },
    ]);
  }

  /** A change made during a write that failed joins the change kept. */
  /**
   * A change made during a write that failed joins the change kept.
   * Resolves `false` when they cancel out (a new event deleted meanwhile):
   * nothing is left to write again.
   */
  private takeQueued(edit: AgendaEdit): boolean {
    if (!edit.queued) return true;
    const merged = mergeChanges(
      edit.change,
      edit.queued,
      this.zoneOf(edit.base),
    );
    edit.queued = undefined;
    if (merged) edit.change = merged;
    return merged !== null;
  }

  /**
   * A refused change, as told: in immediate mode no longer kept (the event
   * is drawn back; a Retry resends the copy), in staged mode kept for the
   * next Save.
   */
  private markFailed(edit: AgendaEdit, message: string): AgendaEdit {
    edit.status = "error";
    edit.message = message;
    // A new event refused takes the change made to it along: they go again
    // together, from the Retry copy (its temporary id means nothing to the route).
    const isLeft =
      this.isImmediate && !makesNewEvent(edit.change)
        ? true
        : this.takeQueued(edit);
    // Cancelled meanwhile (a new event deleted): nothing to keep, nor retry.
    if (!isLeft) edit.retryable = false;
    if (!this.isImmediate && isLeft) return edit;
    this.map.delete(edit.key);
    const { queued, ...refused } = toRaw(edit);
    // A change made during the refused write is the user's own: it goes on
    // its own, never merged into what the route refused.
    if (queued)
      void Promise.resolve().then(() =>
        this.record(
          afterRefused(refused.change, queued),
          { base: edit.base },
          true,
        ),
      );
    return refused;
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
    // A change already confirmed is not asked about again.
    return this.send([edit], { overwrite: true, force: edit.forced });
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
    await this.inFlight.settled(keys);
    const request: AgendaSaveRequest = {
      ...this.options.context(),
      changes,
      ...flagsOf({ force }),
    };
    let response: AgendaSaveResponse;
    this.writing.count += 1;
    try {
      response =
        (await this.inFlight.track(keys, this.options.send(request))) ?? {};
    } catch {
      return false;
    } finally {
      this.writing.count -= 1;
    }
    if (response.confirm) {
      if (force || !(await this.options.confirm(response.confirm)))
        return false;
      return this.writeNow(changes, true);
    }
    const errors = errorsByIndex(response);
    const written = changes.filter((_change, index) => !errors.has(index));
    this.options.onAnswer(response, written, request);
    return written.length === changes.length;
  }
}

/** A save engine for an agenda (see {@link AgendaSaveEngine}). */
export function createAgendaSaveEngine(
  options: AgendaSaveEngineOptions,
): AgendaSaveEngine {
  return new AgendaSaveEngine(options);
}
