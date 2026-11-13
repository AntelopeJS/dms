import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
  type ComputedRef,
  type ShallowRef,
} from "vue";
import {
  isNumber,
  isObject,
  isString,
} from "../../../../../dms-core/app/utils/type-check";
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
import {
  parseMockupSpec,
  type MockupSpecDocument,
} from "../../utils/mockupSpec";
import { stampedHistory } from "../../utils/mockupStamp";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

/** Why the editor's spec changed under the developer, or could not be saved. */
export type MockupSpecNotice =
  | { kind: "adopted" }
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

interface MockupSpecOptions {
  name: string;
  authFetch: AuthFetch;
  /** The compiled state the stream last sent: each new one re-reads the file. */
  state: Readonly<ShallowRef<MockupState | undefined>>;
  onNotice: (notice: MockupSpecNotice) => void;
}

/** The spec the `/mockup` editor changes, and its undo history. */
export interface MockupSpecEditor {
  /** The spec as the editor holds it now; undefined until it is read. */
  spec: ComputedRef<MockupSpecDocument | undefined>;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  /** The last change from outside the editor took over its own spec. */
  adoption: Readonly<ShallowRef<MockupAdoption | undefined>>;
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function parseSource(value: unknown): SpecSource | undefined {
  if (!isRecord(value) || !isString(value.digest)) return undefined;
  const spec = parseMockupSpec(value.spec);
  return spec ? { spec, digest: value.digest } : undefined;
}

type WriteAnswer =
  | { ok: true; digest: string }
  | { ok: false; issue: MockupIssue };

function parseWriteAnswer(value: unknown): WriteAnswer | undefined {
  if (!isRecord(value)) return undefined;
  if (value.ok === true && isString(value.digest)) {
    return { ok: true, digest: value.digest };
  }
  const [first] = Array.isArray(value.errors) ? value.errors : [];
  if (value.ok !== false || !isRecord(first)) return undefined;
  const { path, message } = first;
  return isString(path) && isString(message)
    ? { ok: false, issue: { path, message } }
    : undefined;
}

function statusOf(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const response = isRecord(error.response) ? error.response : {};
  return [error.status, error.statusCode, response.status].find(isNumber);
}

function sameSpec(
  left: MockupSpecDocument,
  right: MockupSpecDocument,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const endpoint = mockupEndpoint(options.name, "/spec");
  const history = shallowRef<MockupHistory<MockupSpecDocument>>();
  const written = shallowRef<MockupSpecDocument>();
  const adoption = shallowRef<MockupAdoption>();
  const hasFailed = shallowRef(false);
  const isAwaitingState = shallowRef(false);
  let digest: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  /** Specs sent whose answer never came: the file may hold any of them. */
  let unconfirmed: MockupSpecDocument[] = [];
  let isWriting = false;
  let isCheckDue = false;
  let isClosed = false;

  /**
   * Reads the file; undefined when it cannot be read or holds no valid spec.
   * `onError` hears why, and only a write that needed the read reports it.
   */
  async function read(
    onError?: (error: unknown) => void,
  ): Promise<SpecSource | undefined> {
    try {
      const source = parseSource(await options.authFetch(endpoint));
      if (!source) onError?.(new Error("spec.json could not be read"));
      return source;
    } catch (error) {
      onError?.(error);
      return undefined;
    }
  }

  function stopTimers(): void {
    if (timer !== undefined) clearTimeout(timer);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    timer = undefined;
    retryTimer = undefined;
  }

  function landed(): void {
    failures = 0;
    unconfirmed = [];
    hasFailed.value = false;
  }

  /**
   * Takes the file as the editor's own write when it holds the spec shown or
   * one sent without an answer; false when someone else wrote it.
   */
  function claim(source: SpecSource): boolean {
    const own = [history.value?.present, ...unconfirmed].find(
      (spec) => spec !== undefined && sameSpec(source.spec, spec),
    );
    if (!own) return false;
    digest = source.digest;
    written.value = own;
    landed();
    return true;
  }

  /**
   * Takes the file as the spec last written or read, or one sent without an
   * answer, with ids a note stamped; false when it changed more.
   */
  function takeStamps(source: SpecSource): boolean {
    const bases = [written.value, ...unconfirmed].flatMap((spec) => spec ?? []);
    const stamped =
      history.value && stampedHistory(history.value, bases, source.spec);
    if (!stamped) return false;
    history.value = stamped.history;
    digest = source.digest;
    written.value = stamped.written;
    landed();
    return true;
  }

  function adopt(source: SpecSource, isNews: boolean): void {
    const previous = history.value?.present;
    stopTimers();
    landed();
    digest = source.digest;
    written.value = source.spec;
    history.value = reset(source.spec);
    if (!isNews) return;
    adoption.value = { previous, next: source.spec };
    options.onNotice({ kind: "adopted" });
  }

  function isBusy(): boolean {
    return isWriting || timer !== undefined;
  }

  async function check(): Promise<void> {
    if (isBusy()) {
      isCheckDue = true;
      return;
    }
    const source = await read();
    const present = history.value?.present;
    if (!source || isClosed) return;
    if (source.digest === digest) {
      if (!isBusy() && present !== written.value) void write();
      return;
    }
    if (isBusy()) {
      isCheckDue = true;
      return;
    }
    if (!claim(source) && !takeStamps(source)) {
      adopt(source, present !== undefined);
      return;
    }
    stopTimers();
    if (history.value?.present !== written.value) schedule();
  }

  function revert(issue: MockupIssue, sent: MockupSpecDocument): void {
    const current = history.value;
    const discarded = !!current && current.present !== sent;
    if (current && written.value) {
      history.value = revertTo(current, written.value);
    }
    stopTimers();
    landed();
    options.onNotice({ kind: "refused", issue, discarded });
  }

  function retryLater(): void {
    if (isClosed) return;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    const delay = Math.min(
      MOCKUP_RETRY_DELAY_MS * 2 ** failures,
      MOCKUP_RETRY_MAX_DELAY_MS,
    );
    failures += 1;
    retryTimer = setTimeout(() => void write(), delay);
  }

  function failed(error: unknown): void {
    if (!hasFailed.value) options.onNotice({ kind: "failed", error });
    hasFailed.value = true;
    retryLater();
  }

  async function onWriteError(
    error: unknown,
    sent: MockupSpecDocument,
  ): Promise<void> {
    if (statusOf(error) !== HTTP_CONFLICT) {
      if (!unconfirmed.includes(sent)) unconfirmed.push(sent);
      failed(error);
      return;
    }
    let readError: unknown;
    const source = await read((cause) => {
      readError = cause;
    });
    if (isClosed) return;
    if (!source) failed(readError);
    else if (!claim(source) && !takeStamps(source)) adopt(source, true);
  }

  async function write(): Promise<void> {
    timer = undefined;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    const spec = history.value?.present;
    if (!spec || isWriting || isClosed) return;
    if (spec === written.value && !unconfirmed.length) {
      landed();
      return;
    }
    const sentAt = options.state.value?.revision;
    isWriting = true;
    try {
      const answer = parseWriteAnswer(
        await options.authFetch(endpoint, {
          method: "PUT",
          body: { spec, digest },
        }),
      );
      if (answer?.ok) {
        digest = answer.digest;
        written.value = spec;
        isAwaitingState.value = options.state.value?.revision === sentAt;
        landed();
      } else if (answer) {
        revert(answer.issue, spec);
      }
    } catch (error) {
      await onWriteError(error, spec);
    } finally {
      isWriting = false;
    }
    const present = history.value?.present;
    if (present !== written.value && retryTimer === undefined) schedule();
    else if (isCheckDue && !isClosed) {
      isCheckDue = false;
      void check();
    }
  }

  function schedule(): void {
    if (isClosed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void write(), MOCKUP_WRITE_DELAY_MS);
  }

  function move(next: MockupHistory<MockupSpecDocument>): void {
    if (next === history.value) return;
    history.value = next;
    schedule();
  }

  function apply(
    edit: MockupEdit,
    coalesceKey?: string,
  ): MockupEditResult | undefined {
    const current = history.value;
    if (!current) return undefined;
    const result = applyMockupEdit(current.present, edit);
    if (result.spec === current.present) return undefined;
    move(commit(current, result.spec, coalesceKey));
    return result;
  }

  onMounted(async () => {
    const source = await read();
    if (source && !isClosed && !history.value) adopt(source, false);
  });
  watch(
    () => options.state.value?.revision,
    () => {
      isAwaitingState.value = false;
      void check();
    },
  );
  onBeforeUnmount(() => {
    const isDue = timer !== undefined || retryTimer !== undefined;
    stopTimers();
    if (isDue) void write();
    isClosed = true;
  });

  return {
    spec: computed(() => history.value?.present),
    canUndo: computed(() => !!history.value?.past.length),
    canRedo: computed(() => !!history.value?.future.length),
    adoption,
    hasFailed: computed(() => hasFailed.value),
    isPending: computed(
      () =>
        !!history.value &&
        (history.value.present !== written.value || isAwaitingState.value),
    ),
    apply,
    undo: () => {
      if (history.value) move(undo(history.value));
    },
    redo: () => {
      if (history.value) move(redo(history.value));
    },
  };
}
