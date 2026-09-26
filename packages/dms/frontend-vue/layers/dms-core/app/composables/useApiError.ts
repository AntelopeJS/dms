interface Options {
  context?: string;
  title?: string;
  description?: string;
}

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

function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null;
}

function resolveDescription(error: ApiError): string {
  const errorData = error.data as Record<string, unknown> | string | undefined;
  if (
    errorData &&
    typeof errorData === "object" &&
    typeof errorData.message === "string"
  ) {
    return errorData.message;
  }
  if (typeof errorData === "string") {
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
export function resolveApiErrorTitle(error: unknown): string {
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
export function resolveApiErrorMessage(error: unknown): string {
  return isApiError(error) ? resolveDescription(error) : FALLBACK_ERROR_KEY;
}

export function useApiError(error: unknown, options?: Options) {
  const toast = useToast();
  const dmsApp = useDmsApp();
  const { t } = dmsApp.$i18n;
  const translate = (message: string) => resolveApiMessage(t, message);

  const title = options?.title || resolveApiErrorTitle(error);
  const description = options?.description || resolveApiErrorMessage(error);

  toast.add({
    title: translate(title),
    description: translate(description),
    color: "error",
  });
}
