/**
 * Starts work nobody waits for. A rejection still surfaces as an unhandled
 * rejection, the way it does for a promise left unawaited.
 */
export const detach = (pending: Promise<unknown>): void => {
  pending.catch((error: unknown) => {
    throw error;
  });
};
