import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import type { JsonValue } from "../../../../../dms-core/app/types/json";
import { isString } from "../../../../../dms-core/app/utils/type-check";
import { fetchStatus } from "../../utils/fetchStatus";
import { isObjectValue } from "../../utils/json";
import {
  mockupEndpoint,
  type MockupIssue,
  type MockupState,
} from "../../utils/mockup";
import {
  applyMockupEdit,
  type MockupEdit,
  type MockupEditResult,
} from "../../utils/mockupEdit";
import {
  commit,
  redo,
  reset,
  revertTo,
  undo,
  type MockupHistory,
} from "../../utils/mockupHistory";
import { rebasedEdit } from "../../utils/mockupRebase";
import {
  parseMockupSpec,
  type MockupSpecDocument,
} from "../../utils/mockupSpec";
import { stampedHistory } from "../../utils/mockupStamp";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

/** Why the editor's spec changed under the developer, or could not be saved. */
export type MockupSpecNotice =
  | {
      kind: "adopted";
      /** The name of the viewer of the editor who wrote the file, when one did: the change is news, not a surprise. */
      by?: string;
    }
  | {
      kind: "refused";
      issue: MockupIssue;
      /** Edits typed while the refused write was in flight, dropped with it. */
      discarded: boolean;
    }
  | { kind: "failed"; error: unknown };

/** An outside change the editor took in place of the spec it held. */
export interface MockupAdoption {
  previous: MockupSpecDocument | undefined;
  next: MockupSpecDocument;
}

/** A change the editor made to its own spec: an edit, an undo or a redo. */
export interface MockupOwnEdit {
  previous: MockupSpecDocument;
  next: MockupSpecDocument;
}

interface MockupSpecOptions {
  name: string;
  authFetch: AuthFetch;
  /** The compiled state the stream last sent: each new one re-reads the file. */
  state: Readonly<ShallowRef<MockupState | undefined>>;
  onNotice: (notice: MockupSpecNotice) => void;
  /** This browser session's viewer id, which each write names: its own locks do not refuse it. */
  viewer?: string;
  /**
   * The id of the block this session holds the lock of, while it holds one:
   * the editor finds the block by it, wherever an edit or an outside change
   * put it, and never writes it.
   */
  held?: Readonly<Ref<string | undefined>>;
  /**
   * Whether the viewer edits the spec. False for a reviewer, whom the backend
   * refuses the spec routes: the editor then neither reads nor writes the
   * file, holds no spec, and every edit changes nothing. Defaults to true.
   */
  enabled?: boolean;
}

/** The spec the `/mockup` editor changes, and its undo history. */
export interface MockupSpecEditor {
  /** The spec as the editor holds it now; undefined until it is read. */
  spec: ComputedRef<MockupSpecDocument | undefined>;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  /** The last change from outside the editor took over its own spec. */
  adoption: Readonly<ShallowRef<MockupAdoption | undefined>>;
  /**
   * The digest of the file as the editor last read or wrote it: the file's
   * once no edit is pending, which names the spec a lock is taken in.
   */
  digest: Readonly<ShallowRef<string | undefined>>;
  /** The last change the editor made to its own spec: never one that came from outside, nor one that took ids a note stamped. */
  ownEdit: Readonly<ShallowRef<MockupOwnEdit | undefined>>;
  /** Whether the last write failed and is being retried: true until one lands. */
  hasFailed: ComputedRef<boolean>;
  /**
   * Whether the spec shown is not yet the one the stream last compiled: an
   * edit not written yet, or written but not yet sent back by the stream. The
   * paths of the compiled state do not name its nodes until then.
   */
  isPending: ComputedRef<boolean>;
  /**
   * Applies `edit` and saves the result; undefined when the spec is not read
   * yet or the edit changes nothing. Consecutive edits with the same
   * `coalesceKey` undo as one.
   */
  apply: (
    edit: MockupEdit,
    coalesceKey?: string,
  ) => MockupEditResult | undefined;
  undo: () => void;
  redo: () => void;
}

/** How long the editor waits after an edit before it writes: one write per burst of typing. */
export const MOCKUP_WRITE_DELAY_MS = 150;

/** How long the editor waits before it retries a failed write, doubling after each failure. */
export const MOCKUP_RETRY_DELAY_MS = 500;

/** The longest wait between two retries of a failed write. */
export const MOCKUP_RETRY_MAX_DELAY_MS = 8000;

const HTTP_CONFLICT = 409;

interface SpecSource {
  spec: MockupSpecDocument;
  digest: string;
  /** The name of the viewer of an editor whose write made this very file. */
  writtenBy?: { name: string };
}

function parseSource(value: JsonValue | undefined): SpecSource | undefined {
  if (!isObjectValue(value) || !isString(value.digest)) return undefined;
  const spec = parseMockupSpec(value.spec);
  if (!spec) return undefined;
  const { writtenBy } = value;
  return isObjectValue(writtenBy) && isString(writtenBy.name)
    ? { spec, digest: value.digest, writtenBy: { name: writtenBy.name } }
    : { spec, digest: value.digest };
}

type WriteAnswer =
  | { ok: true; digest: string }
  | { ok: false; issue: MockupIssue };

function parseWriteAnswer(
  value: JsonValue | undefined,
): WriteAnswer | undefined {
  if (!isObjectValue(value)) return undefined;
  if (value.ok === true && isString(value.digest)) {
    return { ok: true, digest: value.digest };
  }
  const [first] = Array.isArray(value.errors) ? value.errors : [];
  if (value.ok !== false || !isObjectValue(first)) return undefined;
  const { path, message } = first;
  return isString(path) && isString(message)
    ? { ok: false, issue: { path, message } }
    : undefined;
}

function sameSpec(
  left: MockupSpecDocument,
  right: MockupSpecDocument,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function ignoreRejection(task: Promise<void>): void {
  task.catch(() => undefined);
}

/** The reads, writes and retries that keep one editor's spec and `spec.json` in step. */
class MockupSpecSync {
  readonly history = shallowRef<MockupHistory<MockupSpecDocument>>();
  readonly written = shallowRef<MockupSpecDocument>();
  readonly adoption = shallowRef<MockupAdoption>();
  readonly ownEdit = shallowRef<MockupOwnEdit>();
  /** The digest of the file as the editor last read or wrote it. */
  readonly digest = shallowRef<string>();
  readonly hasFailed = shallowRef(false);
  readonly isAwaitingState = shallowRef(false);
  isClosed = false;
  private readonly endpoint: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  /** Specs sent whose answer never came: the file may hold any of them. */
  private unconfirmed: MockupSpecDocument[] = [];
  private isWriting = false;
  private isCheckDue = false;

  constructor(private readonly options: MockupSpecOptions) {
    this.endpoint = mockupEndpoint(options.name, "/spec");
  }

  /**
   * Reads the file; undefined when it cannot be read or holds no valid spec.
   * `onError` hears why, and only a write that needed the read reports it.
   */
  async read(
    onError?: (cause: unknown) => void,
  ): Promise<SpecSource | undefined> {
    try {
      const source = parseSource(
        await this.options.authFetch<JsonValue>(this.endpoint),
      );
      if (!source) onError?.(new Error("spec.json could not be read"));
      return source;
    } catch (error) {
      onError?.(error);
      return undefined;
    }
  }

  stopTimers(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.timer = undefined;
    this.retryTimer = undefined;
  }

  hasDueWrite(): boolean {
    return this.timer !== undefined || this.retryTimer !== undefined;
  }

  private landed(): void {
    this.failures = 0;
    this.unconfirmed = [];
    this.hasFailed.value = false;
  }

  /**
   * Takes the file as the editor's own write when it holds the spec shown or
   * one sent without an answer; false when someone else wrote it.
   */
  private claim(source: SpecSource): boolean {
    const own = [this.history.value?.present, ...this.unconfirmed].find(
      (spec) => spec !== undefined && sameSpec(source.spec, spec),
    );
    if (!own) return false;
    this.digest.value = source.digest;
    this.written.value = own;
    this.landed();
    return true;
  }

  /**
   * Takes the file as the spec last written or read, or one sent without an
   * answer, with ids a note stamped; false when it changed more.
   */
  private takeStamps(source: SpecSource): boolean {
    const bases = [this.written.value, ...this.unconfirmed].flatMap(
      (spec) => spec ?? [],
    );
    const stamped =
      this.history.value &&
      stampedHistory(this.history.value, bases, source.spec);
    if (!stamped) return false;
    this.history.value = stamped.history;
    this.digest.value = source.digest;
    this.written.value = stamped.written;
    this.landed();
    return true;
  }

  /**
   * The file with the edit not written yet put back on it, when the edit is
   * all inside the block this session holds: see {@link rebasedEdit}.
   */
  private keptEdit(source: SpecSource): MockupSpecDocument | undefined {
    const present = this.history.value?.present;
    const held = this.options.held?.value;
    const written = this.written.value;
    if (!present || !written || present === written || held === undefined) {
      return undefined;
    }
    return rebasedEdit(written, present, source.spec, held);
  }

  /**
   * Takes the file in place of the spec held, starting the history over. An
   * edit inside the block this session holds is kept and written on top. The
   * notice names the viewer who wrote the file only when no edit not written
   * yet goes with it: an edit it drops is never dropped in silence.
   */
  adopt(source: SpecSource, isNews: boolean): void {
    const previous = this.history.value?.present;
    const kept = isNews ? this.keptEdit(source) : undefined;
    const isLosing =
      previous !== undefined && previous !== this.written.value && !kept;
    this.stopTimers();
    this.landed();
    this.digest.value = source.digest;
    this.written.value = source.spec;
    this.history.value = kept
      ? commit(reset(source.spec), kept)
      : reset(source.spec);
    if (!isNews) return;
    this.adoption.value = { previous, next: kept ?? source.spec };
    this.options.onNotice(
      source.writtenBy && !isLosing
        ? { kind: "adopted", by: source.writtenBy.name }
        : { kind: "adopted" },
    );
    if (kept) this.schedule();
  }

  private isBusy(): boolean {
    return this.isWriting || this.timer !== undefined;
  }

  async check(): Promise<void> {
    if (this.isBusy()) {
      this.isCheckDue = true;
      return;
    }
    const source = await this.read();
    const present = this.history.value?.present;
    if (!source || this.isClosed) return;
    if (source.digest === this.digest.value) {
      if (!this.isBusy() && present !== this.written.value) {
        ignoreRejection(this.write());
      }
      return;
    }
    if (this.isBusy()) {
      this.isCheckDue = true;
      return;
    }
    if (!this.claim(source) && !this.takeStamps(source)) {
      this.adopt(source, present !== undefined);
      return;
    }
    this.stopTimers();
    if (this.history.value?.present !== this.written.value) this.schedule();
  }

  private revert(issue: MockupIssue, sent: MockupSpecDocument): void {
    const current = this.history.value;
    const discarded = !!current && current.present !== sent;
    if (current && this.written.value) {
      this.history.value = revertTo(current, this.written.value);
    }
    this.stopTimers();
    this.landed();
    this.options.onNotice({ kind: "refused", issue, discarded });
  }

  private retryLater(): void {
    if (this.isClosed) return;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    const delay = Math.min(
      MOCKUP_RETRY_DELAY_MS * 2 ** this.failures,
      MOCKUP_RETRY_MAX_DELAY_MS,
    );
    this.failures += 1;
    this.retryTimer = setTimeout(() => ignoreRejection(this.write()), delay);
  }

  private failed(cause: unknown): void {
    if (!this.hasFailed.value) {
      this.options.onNotice({ kind: "failed", error: cause });
    }
    this.hasFailed.value = true;
    this.retryLater();
  }

  private async onWriteError(
    cause: unknown,
    sent: MockupSpecDocument,
  ): Promise<void> {
    if (fetchStatus(cause) !== HTTP_CONFLICT) {
      if (!this.unconfirmed.includes(sent)) this.unconfirmed.push(sent);
      this.failed(cause);
      return;
    }
    let readError: unknown;
    const source = await this.read((reason) => {
      readError = reason;
    });
    if (this.isClosed) return;
    if (!source) this.failed(readError);
    else if (!this.claim(source) && !this.takeStamps(source)) {
      this.adopt(source, true);
    }
  }

  async write(): Promise<void> {
    this.timer = undefined;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const spec = this.history.value?.present;
    if (!spec || this.isWriting || this.isClosed) return;
    if (spec === this.written.value && !this.unconfirmed.length) {
      this.landed();
      return;
    }
    const sentAt = this.options.state.value?.revision;
    this.isWriting = true;
    try {
      const answer = parseWriteAnswer(
        await this.options.authFetch<JsonValue>(this.endpoint, {
          method: "PUT",
          body:
            this.options.viewer === undefined
              ? { spec, digest: this.digest.value }
              : {
                  spec,
                  digest: this.digest.value,
                  viewer: this.options.viewer,
                },
        }),
      );
      if (answer?.ok) {
        this.digest.value = answer.digest;
        this.written.value = spec;
        this.isAwaitingState.value =
          this.options.state.value?.revision === sentAt;
        this.landed();
      } else if (answer) {
        this.revert(answer.issue, spec);
      }
    } catch (error) {
      await this.onWriteError(error, spec);
    } finally {
      this.isWriting = false;
    }
    const present = this.history.value?.present;
    if (present !== this.written.value && this.retryTimer === undefined) {
      this.schedule();
    } else if (this.isCheckDue && !this.isClosed) {
      this.isCheckDue = false;
      ignoreRejection(this.check());
    }
  }

  private schedule(): void {
    if (this.isClosed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => ignoreRejection(this.write()),
      MOCKUP_WRITE_DELAY_MS,
    );
  }

  move(next: MockupHistory<MockupSpecDocument>): void {
    const previous = this.history.value?.present;
    if (!previous || next === this.history.value) return;
    this.history.value = next;
    this.ownEdit.value = { previous, next: next.present };
    this.schedule();
  }

  apply(edit: MockupEdit, coalesceKey?: string): MockupEditResult | undefined {
    const current = this.history.value;
    if (!current) return undefined;
    const result = applyMockupEdit(current.present, edit);
    if (result.spec === current.present) return undefined;
    this.move(commit(current, result.spec, coalesceKey));
    return result;
  }
}

/**
 * Edits `mockups/<name>/spec.json` from the browser: reads it, applies each
 * edit through the reducer and the undo history, and writes the result about
 * {@link MOCKUP_WRITE_DELAY_MS} after the last edit, the latest spec winning.
 * Each write names the digest the editor last read or wrote, so a file someone
 * else (the AI) wrote since is never overwritten: the editor takes that file
 * instead, starts its history over and says so. A write the backend refuses
 * takes the editor back to the last spec it wrote, with the history steps and
 * the later edits that refusal undoes dropped. A write that fails otherwise
 * is retried, after a growing delay, at the next stream state or with the next
 * edit, whichever comes first, until it lands. A file holding the spec shown,
 * or any spec sent whose answer was lost, is the editor's own write, never an
 * outside change. Nor is a file that only adds ids a note stamped on nodes
 * that had none of one of those specs, or of the spec last written or read:
 * the editor keeps its history and any edit not written yet, and each id
 * joins every step of the history that holds its block.
 */
export function useMockupSpec(options: MockupSpecOptions): MockupSpecEditor {
  const sync = new MockupSpecSync(options);
  const { history, written } = sync;
  const enabled = options.enabled !== false;

  onMounted(async () => {
    if (!enabled) return;
    const source = await sync.read();
    if (source && !sync.isClosed && !history.value) sync.adopt(source, false);
  });
  watch(
    () => options.state.value?.revision,
    () => {
      if (!enabled) return;
      sync.isAwaitingState.value = false;
      ignoreRejection(sync.check());
    },
  );
  onBeforeUnmount(() => {
    const isDue = sync.hasDueWrite();
    sync.stopTimers();
    if (isDue) ignoreRejection(sync.write());
    sync.isClosed = true;
  });

  return {
    spec: computed(() => history.value?.present),
    canUndo: computed(() => !!history.value?.past.length),
    canRedo: computed(() => !!history.value?.future.length),
    adoption: sync.adoption,
    ownEdit: sync.ownEdit,
    digest: sync.digest,
    hasFailed: computed(() => sync.hasFailed.value),
    isPending: computed(
      () =>
        !!history.value &&
        (history.value.present !== written.value || sync.isAwaitingState.value),
    ),
    apply: (edit, coalesceKey) => sync.apply(edit, coalesceKey),
    undo: () => {
      if (history.value) sync.move(undo(history.value));
    },
    redo: () => {
      if (history.value) sync.move(redo(history.value));
    },
  };
}
