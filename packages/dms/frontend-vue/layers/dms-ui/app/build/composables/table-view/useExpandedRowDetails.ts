import { ref } from "vue";

/** Where the row a `lazyLoad` band shows stands. */
export type ExpandedRowLoadState = "loading" | "error" | "ready";

/** One open row as `lazyLoad` read it. */
export interface ExpandedRowDetailEntry<T> {
  state: ExpandedRowLoadState;
  row?: T;
}

/**
 * The rows `lazyLoad` bands show, read by id when they open and kept until
 * `reset`, which the table calls whenever its listed rows reload: a band
 * never lags behind its row. An answer that lands after a reset is dropped.
 */
export function useExpandedRowDetails<T>(
  getRow: (id: string) => Promise<T | undefined>,
) {
  const entries = ref<Record<string, ExpandedRowDetailEntry<T>>>({});
  let generation = 0;

  const setEntry = (id: string, entry: ExpandedRowDetailEntry<T>) => {
    entries.value = { ...entries.value, [id]: entry };
  };

  async function load(id: string): Promise<void> {
    const loadedFor = generation;
    setEntry(id, { state: "loading" });
    let row: T | undefined;
    try {
      row = await getRow(id);
    } catch {
      row = undefined;
    }
    if (loadedFor !== generation) return;
    setEntry(id, row ? { state: "ready", row } : { state: "error" });
  }

  /** Reads the rows among `ids` not read yet. */
  function ensure(ids: string[]): void {
    for (const id of ids) {
      if (!entries.value[id]) void load(id);
    }
  }

  function reset(): void {
    generation += 1;
    entries.value = {};
  }

  const entryOf = (id: string): ExpandedRowDetailEntry<T> | undefined =>
    entries.value[id];

  return { entryOf, ensure, load, reset };
}
