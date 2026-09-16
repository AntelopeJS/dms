interface Options {
  context?: string;
  title?: string;
  description?: string;
}

interface ApiError {
  statusCode?: number;
  message?: string;
  data?: unknown;
}

const DEFAULT_TITLE_KEY = "error.500.title";
const FALLBACK_ERROR_KEY = "error.500.description";

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

  const title = options?.title || DEFAULT_TITLE_KEY;
  const description = options?.description || resolveApiErrorMessage(error);

  toast.add({
    title: translate(title),
    description: translate(description),
    color: "error",
  });
}
