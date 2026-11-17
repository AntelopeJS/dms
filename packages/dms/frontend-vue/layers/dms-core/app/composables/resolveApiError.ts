import { isObject, isString } from "../utils/type-check";

interface ApiError {
  statusCode?: number;
  status?: number;
  message?: string;
  data?: unknown;
}

const SERVER_ERROR_TITLE_KEY = "error.500.title";
const CLIENT_ERROR_TITLE_KEY = "error.request_refused.title";
const FALLBACK_ERROR_KEY = "error.500.description";
const CLIENT_ERROR_STATUS_MIN = 400;
const CLIENT_ERROR_STATUS_MAX = 499;

function isApiError(
  error: Parameters<typeof resolveApiErrorTitle>[0],
): error is ApiError {
  return isObject(error) && error !== null;
}

function resolveDescription(error: ApiError): string {
  const errorData = error.data;
  if (errorData && isObject(errorData) && isString(errorData.message)) {
    return errorData.message;
  }
  if (isString(errorData)) {
    return errorData;
  }
  return FALLBACK_ERROR_KEY;
}

function isClientErrorStatus(status: number | undefined): boolean {
  return (
    status !== undefined &&
    status >= CLIENT_ERROR_STATUS_MIN &&
    status <= CLIENT_ERROR_STATUS_MAX
  );
}

/**
 * The i18n title key matching a fetch error's HTTP status: a 4xx is a request
 * the backend refused, anything else (5xx, network failure) a server error.
 */
export function resolveApiErrorTitle(
  error: Parameters<typeof isObject>[0],
): string {
  const status = isApiError(error)
    ? (error.statusCode ?? error.status)
    : undefined;
  return isClientErrorStatus(status)
    ? CLIENT_ERROR_TITLE_KEY
    : SERVER_ERROR_TITLE_KEY;
}

/**
 * Extract the backend's error body from a fetch error — an i18n message key
 * per the API error contract — falling back to the generic 500 key.
 */
export function resolveApiErrorMessage(
  error: Parameters<typeof resolveApiErrorTitle>[0],
): string {
  return isApiError(error) ? resolveDescription(error) : FALLBACK_ERROR_KEY;
}
