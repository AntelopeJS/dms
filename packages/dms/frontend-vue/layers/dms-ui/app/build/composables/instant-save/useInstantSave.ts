import {
  computed,
  onScopeDispose,
  reactive,
  ref,
  type ComputedRef,
  type Ref,
} from "vue";
import type { SaveStatusState } from "../../../components/save-bar/SaveStatus.vue";
import { sameFormValue } from "../../../composables/unsaved-changes/formValue";

/** How long typing pauses before a text saves. */
export const INSTANT_SAVE_DEBOUNCE_MS = 500;
/** How long a key keeps its "Saved" tick. */
export const INSTANT_SAVED_STATE_MS = 2000;

// The one state a page shows for many keys: a save running wins, then a
// failure waiting for its retry, then a save that just went through.
const STATE_PRIORITY: readonly SaveStatusState[] = ["saving", "error", "saved"];

/**
 * Folds the per-control save states of a page into the one state its header
 * pill shows: saving while any control writes, error while any failed, saved
 * while any just did.
 */
export const combineSaveStates = (
  states: Iterable<SaveStatusState | undefined>,
): SaveStatusState => {
  const present = new Set(states);
  return STATE_PRIORITY.find((state) => present.has(state)) ?? "idle";
};

type InstantSaveKey<V> = Extract<keyof V, string>;

/**
 * Where instantly saved values live: what the page shows (`read`, `write`)
 * and where they are kept (`save`: a request to the server, or nothing more
 * than the write for a value kept in a cookie).
 */
export interface InstantSaveSource<V extends object> {
  /** The value a key shows now. */
  read: <K extends InstantSaveKey<V>>(key: K) => V[K];
  /** Shows a value: the one picked, or the one a failed save puts back. */
  write: <K extends InstantSaveKey<V>>(key: K, value: V[K]) => void;
  /** Keeps the changed keys; rejects when they are refused. */
  save: (changes: Partial<V>) => Promise<void>;
  /** Called after a refused save is put back (field errors, a toast). */
  onError?: (error: unknown, changes: Partial<V>) => void;
}

export interface InstantChangeOptions {
  /** Wait for typing to pause (a text) instead of saving at once (a pick). */
  debounce?: boolean;
}

export interface InstantSave<V extends object> {
  /** The save state of each key changed so far. */
  states: Partial<Record<InstantSaveKey<V>, SaveStatusState>>;
  /** The page's one state, for its header pill. */
  state: ComputedRef<SaveStatusState>;
  /** The changes of the saves that failed, until retried. */
  failed: Ref<Partial<V> | null>;
  /** Shows a value and saves it. */
  change: <K extends InstantSaveKey<V>>(
    key: K,
    value: V[K],
    options?: InstantChangeOptions,
  ) => void;
  /** Shows and saves several values in one request. */
  changeMany: (changes: Partial<V>) => void;
  /** Saves a value the source already shows (a control bound to it). */
  queue: <K extends InstantSaveKey<V>>(
    key: K,
    value: V[K],
    options?: InstantChangeOptions,
  ) => void;
  /** Drops a change still waiting for typing to pause. */
  cancel: (key: InstantSaveKey<V>) => void;
  /** Saves the changes still waiting, at once. */
  flush: () => Promise<void>;
  /** Saves again what failed. */
  retry: () => void;
  /** The values the server holds (once loaded): what a failure puts back. */
  confirm: (values: Partial<V>) => void;
}

type Timer = ReturnType<typeof setTimeout>;

/** The saves of one page: what waits, what runs, what the server holds. */
class InstantSaveQueue<V extends object> {
  readonly states = reactive({}) as Partial<
    Record<InstantSaveKey<V>, SaveStatusState>
  >;
  readonly failed = ref<Partial<V> | null>(null) as Ref<Partial<V> | null>;
  private readonly confirmed = new Map<InstantSaveKey<V>, unknown>();
  private readonly pending = new Map<InstantSaveKey<V>, unknown>();
  private readonly inFlight = new Set<InstantSaveKey<V>>();
  private readonly debounceTimers = new Map<InstantSaveKey<V>, Timer>();
  private readonly savedTimers = new Map<InstantSaveKey<V>, Timer>();

  constructor(private readonly source: InstantSaveSource<V>) {}

  /** The value a failure puts back: the server's, or the one first shown. */
  remember(key: InstantSaveKey<V>): void {
    if (!this.confirmed.has(key)) {
      this.confirmed.set(key, this.source.read(key));
    }
  }

  confirm(values: Partial<V>): void {
    for (const [key, value] of Object.entries(values)) {
      this.confirmed.set(key as InstantSaveKey<V>, value);
    }
  }

  /** A change to send with the next save of its key. */
  put(key: InstantSaveKey<V>, value: unknown): void {
    clearTimeout(this.debounceTimers.get(key));
    this.pending.set(key, value);
  }

  wait(key: InstantSaveKey<V>, value: unknown, debounce: boolean): void {
    this.put(key, value);
    if (!debounce) {
      void this.send([key]);
      return;
    }
    this.debounceTimers.set(
      key,
      setTimeout(() => void this.send([key]), INSTANT_SAVE_DEBOUNCE_MS),
    );
  }

  cancel(key: InstantSaveKey<V>): void {
    clearTimeout(this.debounceTimers.get(key));
    this.pending.delete(key);
  }

  async flush(): Promise<void> {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    await this.send([...this.pending.keys()]);
  }

  dispose(): void {
    for (const timer of this.savedTimers.values()) clearTimeout(timer);
  }

  async send(keys: InstantSaveKey<V>[]): Promise<void> {
    const ready = keys.filter(
      (key) => this.pending.has(key) && !this.inFlight.has(key),
    );
    if (ready.length === 0) return;
    const changes = this.take(ready);
    try {
      await this.source.save(changes);
      this.onSaved(changes);
    } catch (error) {
      this.onRefused(error, changes);
    } finally {
      for (const key of ready) this.inFlight.delete(key);
      const followers = ready.filter((key) => this.pending.has(key));
      if (followers.length) void this.send(followers);
    }
  }

  /** Moves the waiting changes of these keys to a running save. */
  private take(keys: InstantSaveKey<V>[]): Partial<V> {
    const changes = Object.fromEntries(
      keys.map((key) => [key, this.pending.get(key)]),
    ) as Partial<V>;
    for (const key of keys) {
      this.pending.delete(key);
      this.inFlight.add(key);
      this.setState(key, "saving");
    }
    return changes;
  }

  private onSaved(changes: Partial<V>): void {
    for (const key of Object.keys(changes) as InstantSaveKey<V>[]) {
      this.confirmed.set(key, changes[key]);
      this.setState(key, "saved");
    }
    this.settleFailed(changes, false);
  }

  private onRefused(error: unknown, changes: Partial<V>): void {
    for (const key of Object.keys(changes) as InstantSaveKey<V>[]) {
      // A newer value picked meanwhile stays on screen: its own save follows.
      const isShown =
        !this.pending.has(key) &&
        sameFormValue(this.source.read(key), changes[key]);
      if (isShown) {
        this.source.write(key, this.confirmed.get(key) as V[typeof key]);
      }
      this.setState(key, "error");
    }
    this.settleFailed(changes, true);
    this.source.onError?.(error, changes);
  }

  private settleFailed(changes: Partial<V>, isRefused: boolean): void {
    const rest = { ...this.failed.value } as Record<string, unknown>;
    for (const key of Object.keys(changes)) delete rest[key];
    const next = isRefused ? { ...rest, ...changes } : rest;
    this.failed.value = Object.keys(next).length ? (next as Partial<V>) : null;
  }

  private setState(key: InstantSaveKey<V>, state: SaveStatusState): void {
    clearTimeout(this.savedTimers.get(key));
    this.states[key] = state;
    if (state !== "saved") return;
    this.savedTimers.set(
      key,
      setTimeout(() => (this.states[key] = "idle"), INSTANT_SAVED_STATE_MS),
    );
  }
}

/**
 * The instant save of a page or a form: each change shows at once and saves
 * on its own — a pick right away, a text once typing pauses — with a state per
 * key (saving, saved, error). A refused save puts back the value the server
 * last confirmed and keeps the change for `retry`. Changes of a key made while
 * its save runs follow once it ends, so the last one always wins.
 */
export function useInstantSave<V extends object>(
  source: InstantSaveSource<V>,
): InstantSave<V> {
  const saves = new InstantSaveQueue(source);

  const queue: InstantSave<V>["queue"] = (key, value, options = {}) =>
    saves.wait(key, value, !!options.debounce);

  const change: InstantSave<V>["change"] = (key, value, options) => {
    saves.remember(key);
    source.write(key, value);
    queue(key, value, options);
  };

  const changeMany: InstantSave<V>["changeMany"] = (changes) => {
    const keys = Object.keys(changes) as InstantSaveKey<V>[];
    for (const key of keys) {
      saves.remember(key);
      source.write(key, changes[key] as V[typeof key]);
      saves.put(key, changes[key]);
    }
    void saves.send(keys);
  };

  const retry: InstantSave<V>["retry"] = () => {
    const changes = saves.failed.value;
    saves.failed.value = null;
    if (changes) changeMany(changes);
  };

  // A text still waiting for typing to pause is saved when the page goes.
  onScopeDispose(() => {
    saves.dispose();
    void saves.flush();
  });

  return {
    states: saves.states,
    state: computed(() => combineSaveStates(Object.values(saves.states))),
    failed: saves.failed,
    change,
    changeMany,
    queue,
    cancel: (key) => saves.cancel(key),
    flush: () => saves.flush(),
    retry,
    confirm: (values) => saves.confirm(values),
  };
}
