/**
 * Starts nothing and awaits nothing: it lets a read that a synchronous
 * `setup()` cannot await fail the test the way an unhandled rejection does.
 */
export function surfaceRejection(read: Promise<unknown>): void {
  read.catch((error: unknown) => {
    throw error;
  });
}
