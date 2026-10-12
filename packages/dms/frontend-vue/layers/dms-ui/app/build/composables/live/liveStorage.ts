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

/** @internal */
export function storePause(key: string, isPaused: boolean): void {
  const storage = liveStorage();
  if (!storage) return;
  try {
    if (isPaused) storage.setItem(key, PAUSED_VALUE);
    else storage.removeItem(key);
  } catch {
    // A full or locked storage only loses the memory of the choice.
  }
}
