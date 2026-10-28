import { isObject } from "../../../dms-core/app/utils/type-check";
import type { apiErrorStatus } from "../../../dms-core/app/composables/useFieldErrors";
interface FetchFailure {
  statusCode?: number;
  status?: number;
}

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;
const CLIENT_ERROR_STATUS_MIN = 400;
const CLIENT_ERROR_STATUS_MAX = 499;
const TRANSIENT_CLIENT_STATUSES = new Set([408, 425, 429]);

function failureStatus(
  error: Parameters<typeof apiErrorStatus>[0],
): number | undefined {
  if (!error || !isObject(error)) return undefined;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The error owner leaves status fields unchecked. This numeric projection preserves legacy coercive comparisons and nullish precedence; validating the fields would change malformed-input behavior.
  const { statusCode, status } = error as FetchFailure;
  return statusCode ?? status;
}

/**
 * A 4xx (404 gone, 403 denied, 410…) is the server's final answer about this
 * file; request timeouts and rate limiting are the exceptions that can heal.
 */
export function isDefinitiveMetadataFailure(
  error: Parameters<typeof apiErrorStatus>[0],
): boolean {
  const status = failureStatus(error);
  return (
    status !== undefined &&
    status >= CLIENT_ERROR_STATUS_MIN &&
    status <= CLIENT_ERROR_STATUS_MAX &&
    !TRANSIENT_CLIENT_STATUSES.has(status)
  );
}

/**
 * Delay before retrying after `failedAttempts` consecutive failures, or `null`
 * when the failure is definitive and the read must not be retried.
 */
export function resolveMetadataRetryDelay(
  error: Parameters<typeof apiErrorStatus>[0],
  failedAttempts: number,
): number | null {
  if (isDefinitiveMetadataFailure(error)) return null;
  const exponent = Math.max(failedAttempts - 1, 0);
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** exponent, RETRY_MAX_DELAY_MS);
}
