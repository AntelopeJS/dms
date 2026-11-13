const STORAGE_KEY_PREFIX = "dms.live.paused:";
const REMEMBER_KEY_PREFIX = "key:";
const PAUSED_VALUE = "1";

/** Browser storage of the paused pages; absent on the server or when denied. */
function liveStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The storage key of a page's Live / Pause choice: its `live.rememberKey` when it
 * shares one, its own id else.
 *
 * @internal
 */
export function liveStorageKey(pageId: string, rememberKey?: string): string {
  return (
    STORAGE_KEY_PREFIX +
    (rememberKey ? REMEMBER_KEY_PREFIX + rememberKey : pageId)
  );
}

/** @internal */
export function readStoredPause(key: string): boolean {
  return liveStorage()?.getItem(key) === PAUSED_VALUE;
}

/**
 * Keeps a page's Live / Pause choice in this browser. Answers whether the
 * storage took it: `false` on the server or when the storage refuses it, which
 * loses only the kept choice.
 *
 * @internal
 */
export function storePause(key: string, isPaused: boolean): boolean {
  const storage = liveStorage();
  if (!storage) return false;
  try {
    if (isPaused) storage.setItem(key, PAUSED_VALUE);
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
