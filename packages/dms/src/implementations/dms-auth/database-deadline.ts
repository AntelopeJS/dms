import { HTTPResult } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";

const HTTP_SERVICE_UNAVAILABLE = 503;

/** How long the auth waits on the database before it answers 503. */
export const AUTH_DATABASE_DEADLINE_MS = 5000;

/** The message of the 503 a request gets when its session cannot be read. */
export const DATABASE_UNAVAILABLE_ERROR = "error.database_unavailable";

/**
 * The 503 a request gets when the database it needs to verify its session
 * failed or did not answer in time. A validator that reads other refusals as
 * an anonymous request lets this one through.
 */
export class DatabaseUnavailable extends HTTPResult {
  constructor() {
    super(HTTP_SERVICE_UNAVAILABLE, DATABASE_UNAVAILABLE_ERROR);
  }
}

class DeadlineExceeded extends Error {}

/**
 * The result of `read`, a database read the auth needs to verify a session,
 * or a 503 when it fails or takes longer than
 * {@link AUTH_DATABASE_DEADLINE_MS}: a session that cannot be read is refused,
 * at once, instead of waiting on the driver's own timeout.
 *
 * @throws DatabaseUnavailable when the read fails or misses the deadline
 */
export async function readBeforeDeadline<T>(read: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DeadlineExceeded()),
      AUTH_DATABASE_DEADLINE_MS,
    );
  });
  try {
    return await Promise.race([read, deadline]);
  } catch (error: unknown) {
    Logging.Warn(
      error instanceof DeadlineExceeded
        ? `[DMS-AUTH] The database did not answer a session read within ${AUTH_DATABASE_DEADLINE_MS} ms`
        : "[DMS-AUTH] A session read failed",
      error,
    );
    throw new DatabaseUnavailable();
  } finally {
    clearTimeout(timer);
  }
}
