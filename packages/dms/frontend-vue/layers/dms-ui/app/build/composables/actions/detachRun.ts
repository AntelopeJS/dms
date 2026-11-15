/**
 * Starts a run nobody awaits. A failure surfaces as an unhandled rejection,
 * as it does when the promise is dropped.
 */
export function detachRun(run: Promise<unknown>): void {
  run.catch((error: unknown) => {
    throw error;
  });
}
