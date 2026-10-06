import {
  computed,
  onScopeDispose,
  reactive,
  ref,
  type ComputedRef,
  type Ref,
} from "vue";
import type { SaveStatusState } from "../../../components/save-bar/SaveStatus.vue";

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

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

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
  type Key = InstantSaveKey<V>;
  const states = reactive({}) as Partial<Record<Key, SaveStatusState>>;
  const failed = ref<Partial<V> | null>(null) as Ref<Partial<V> | null>;
  const confirmed = new Map<Key, unknown>();
  const pending = new Map<Key, unknown>();
  const inFlight = new Set<Key>();
  const debounceTimers = new Map<Key, ReturnType<typeof setTimeout>>();
  const savedTimers = new Map<Key, ReturnType<typeof setTimeout>>();

  function setState(key: Key, state: SaveStatusState): void {
    clearTimeout(savedTimers.get(key));
    states[key] = state;
    if (state !== "saved") return;
    savedTimers.set(
      key,
      setTimeout(() => (states[key] = "idle"), INSTANT_SAVED_STATE_MS),
    );
  }

  function remember(key: Key): void {
    if (!confirmed.has(key)) confirmed.set(key, source.read(key));
  }

  function settleFailed(changes: Partial<V>, isRefused: boolean): void {
    const rest = { ...failed.value } as Record<string, unknown>;
    for (const key of Object.keys(changes)) delete rest[key];
    const next = isRefused ? { ...rest, ...changes } : rest;
    failed.value = Object.keys(next).length ? (next as Partial<V>) : null;
  }

  function onSaved(changes: Partial<V>): void {
    for (const key of Object.keys(changes) as Key[]) {
      confirmed.set(key, changes[key]);
      setState(key, "saved");
    }
    settleFailed(changes, false);
  }

  function onRefused(error: unknown, changes: Partial<V>): void {
    for (const key of Object.keys(changes) as Key[]) {
      // A newer value picked meanwhile stays on screen: its own save follows.
      const isShown =
        !pending.has(key) && sameValue(source.read(key), changes[key]);
      if (isShown) source.write(key, confirmed.get(key) as V[Key]);
      setState(key, "error");
    }
    settleFailed(changes, true);
    source.onError?.(error, changes);
  }

  async function send(keys: Key[]): Promise<void> {
    const ready = keys.filter((key) => pending.has(key) && !inFlight.has(key));
    if (ready.length === 0) return;
    const changes = Object.fromEntries(
      ready.map((key) => [key, pending.get(key)]),
    ) as Partial<V>;
    for (const key of ready) {
      pending.delete(key);
      inFlight.add(key);
      setState(key, "saving");
    }
    try {
      await source.save(changes);
      onSaved(changes);
    } catch (error) {
      onRefused(error, changes);
    } finally {
      for (const key of ready) inFlight.delete(key);
      const followers = ready.filter((key) => pending.has(key));
      if (followers.length) void send(followers);
    }
  }

  const queue: InstantSave<V>["queue"] = (key, value, options = {}) => {
    clearTimeout(debounceTimers.get(key));
    pending.set(key, value);
    if (!options.debounce) {
      void send([key]);
      return;
    }
    debounceTimers.set(
      key,
      setTimeout(() => void send([key]), INSTANT_SAVE_DEBOUNCE_MS),
    );
  };

  const change: InstantSave<V>["change"] = (key, value, options) => {
    remember(key);
    source.write(key, value);
    queue(key, value, options);
  };

  const changeMany: InstantSave<V>["changeMany"] = (changes) => {
    const keys = Object.keys(changes) as Key[];
    for (const key of keys) {
      remember(key);
      clearTimeout(debounceTimers.get(key));
      source.write(key, changes[key] as V[Key]);
      pending.set(key, changes[key]);
    }
    void send(keys);
  };

  const cancel: InstantSave<V>["cancel"] = (key) => {
    clearTimeout(debounceTimers.get(key));
    pending.delete(key);
  };

  const flush: InstantSave<V>["flush"] = async () => {
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    await send([...pending.keys()]);
  };

  const retry: InstantSave<V>["retry"] = () => {
    const changes = failed.value;
    failed.value = null;
    if (changes) changeMany(changes);
  };

  const confirm: InstantSave<V>["confirm"] = (values) => {
    for (const [key, value] of Object.entries(values)) {
      confirmed.set(key as Key, value);
    }
  };

  // A text still waiting for typing to pause is saved when the page goes.
  onScopeDispose(() => {
    for (const timer of savedTimers.values()) clearTimeout(timer);
    void flush();
  });

  return {
    states,
    state: computed(() => combineSaveStates(Object.values(states))),
    failed,
    change,
    changeMany,
    queue,
    cancel,
    flush,
    retry,
    confirm,
  };
}
