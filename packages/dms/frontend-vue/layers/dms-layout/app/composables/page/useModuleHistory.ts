const MODULE_HISTORY_STATE_KEY = "dms-moduleHistory";

export interface ModuleHistoryEntry {
  moduleId: string;
  path: string;
}

export interface ModuleHistoryApi {
  record: (moduleId: string, path: string) => void;
  getLast: (moduleId: string) => string | null;
  entries: ComputedRef<ModuleHistoryEntry[]>;
}

export const useModuleHistory = (): ModuleHistoryApi => {
  const history = useDmsState<Record<string, string>>(
    MODULE_HISTORY_STATE_KEY,
    () => ({}),
  );

  function record(moduleId: string, path: string): void {
    if (!moduleId || !path) return;
    // Re-insert the key so a revisited module moves to the end: a plain
    // spread would keep its first-visit position and break the
    // oldest-to-newest ordering `entries` guarantees.
    const { [moduleId]: _previous, ...others } = history.value;
    history.value = { ...others, [moduleId]: path };
  }

  function getLast(moduleId: string): string | null {
    return history.value[moduleId] ?? null;
  }

  /** Visited modules with their last path, ordered oldest to newest visit. */
  const entries = computed<ModuleHistoryEntry[]>(() =>
    Object.entries(history.value).map(([moduleId, path]) => ({
      moduleId,
      path,
    })),
  );

  return { record, getLast, entries };
};
