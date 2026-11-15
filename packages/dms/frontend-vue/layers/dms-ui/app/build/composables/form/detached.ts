/**
 * Lets `task` run on without a waiter. A failure still surfaces as an
 * unhandled rejection, as it does for a promise nobody awaits.
 */
export function detach(task: Promise<unknown>): void {
  task.catch((error: unknown) => {
    throw error;
  });
}
