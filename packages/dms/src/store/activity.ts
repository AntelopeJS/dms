let isBusy = false;

/**
 * Whether a store operation is changing the set of loaded modules. The
 * frontend manifest carries it, so `ajs dms dev` waits for the set to settle
 * instead of rebuilding for each step of an update.
 */
export function isStoreOperationRunning(): boolean {
  return isBusy;
}

export function setStoreOperationRunning(running: boolean): void {
  isBusy = running;
}
