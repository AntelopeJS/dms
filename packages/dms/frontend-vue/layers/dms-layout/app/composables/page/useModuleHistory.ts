const MODULE_HISTORY_COOKIE = "dms-module-history";
// Kept for a year and bounded, so the cookie stays small on every request.
const MODULE_HISTORY_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const MODULE_HISTORY_MAX_ENTRIES = 12;
const MODULE_HISTORY_MAX_PATH_LENGTH = 300;

export interface ModuleHistoryEntry {
  moduleId: string;
  path: string;
  /** Epoch milliseconds of the last visit; 0 when unknown. */
  visitedAt: number;
}

export interface ModuleHistoryApi {
  record: (moduleId: string, path: string) => void;
  getLast: (moduleId: string) => string | null;
  /** Visited modules with their last path, ordered oldest to newest visit. */
  entries: ComputedRef<ModuleHistoryEntry[]>;
}

interface StoredVisit {
  path: string;
  at: number;
}

type StoredHistory = Record<string, StoredVisit>;

/**
 * Reads whatever the cookie holds into a clean history, dropping anything
 * malformed: a hand-edited cookie or an older shape must never break the
 * modules page or the command palette.
 */
function normalizeHistory(raw: unknown): StoredHistory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: StoredHistory = {};
  for (const [moduleId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const { path, at } = value as Partial<StoredVisit>;
    if (typeof path !== "string" || !path.startsWith("/")) continue;
    result[moduleId] = { path, at: typeof at === "number" ? at : 0 };
  }
  return result;
}

/**
 * Last page visited in each module, kept in a cookie so it survives reloads
 * and the server renders the same catalog links and "recently used" order as
 * the browser.
 */
export const useModuleHistory = (): ModuleHistoryApi => {
  const cookie = useDmsCookie<StoredHistory>(MODULE_HISTORY_COOKIE, {
    default: () => ({}),
    maxAge: MODULE_HISTORY_MAX_AGE_SECONDS,
    sameSite: "lax",
  });

  const history = computed(() => normalizeHistory(cookie.value));

  function record(moduleId: string, path: string): void {
    if (!moduleId || !path || path.length > MODULE_HISTORY_MAX_PATH_LENGTH) {
      return;
    }
    // Re-insert the key so a revisited module moves to the end: a plain
    // spread would keep its first-visit position and break the
    // oldest-to-newest ordering `entries` guarantees. The oldest visits
    // fall off once the history is full.
    const { [moduleId]: _previous, ...others } = history.value;
    const kept = Object.entries(others).slice(
      -(MODULE_HISTORY_MAX_ENTRIES - 1),
    );
    cookie.value = {
      ...Object.fromEntries(kept),
      [moduleId]: { path, at: Date.now() },
    };
  }

  function getLast(moduleId: string): string | null {
    return history.value[moduleId]?.path ?? null;
  }

  const entries = computed<ModuleHistoryEntry[]>(() =>
    Object.entries(history.value).map(([moduleId, visit]) => ({
      moduleId,
      path: visit.path,
      visitedAt: visit.at,
    })),
  );

  return { record, getLast, entries };
};
