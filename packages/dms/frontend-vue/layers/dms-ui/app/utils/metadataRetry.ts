// Retry policy for reading a stored file's metadata. A refused or missing file
// will not come back by asking again, so only failures that can heal on their
// own (network, 5xx, rate limiting) are retried, and with a capped backoff.

interface FetchFailure {
  statusCode?: number;
  status?: number;
}

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;
const CLIENT_ERROR_STATUS_MIN = 400;
const CLIENT_ERROR_STATUS_MAX = 499;
const TRANSIENT_CLIENT_STATUSES = new Set([408, 425, 429]);

function failureStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const { statusCode, status } = error as FetchFailure;
  return statusCode ?? status;
}

/**
 * A 4xx (404 gone, 403 denied, 410…) is the server's final answer about this
 * file; request timeouts and rate limiting are the exceptions that can heal.
 */
export function isDefinitiveMetadataFailure(error: unknown): boolean {
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
  error: unknown,
  failedAttempts: number,
): number | null {
  if (isDefinitiveMetadataFailure(error)) return null;
  const exponent = Math.max(failedAttempts - 1, 0);
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** exponent, RETRY_MAX_DELAY_MS);
}
