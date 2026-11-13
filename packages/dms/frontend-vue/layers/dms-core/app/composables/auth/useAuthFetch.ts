import { isObject } from "../../utils/type-check";

export const CONTENT_LANGUAGE_HEADER = "x-content-language";

const RETRY_HEADER = "x-auth-retry";
const REALTIME_SESSION_HEADER = "x-realtime-session";
const REALTIME_SESSION_STATE_KEY = "dms.realtime.sessionId";

function hasRetryHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) {
    return headers.has(RETRY_HEADER);
  }
  if (Array.isArray(headers)) {
    return headers.some(([name]) => name.toLowerCase() === RETRY_HEADER);
  }
  return Object.keys(headers).some(
    (name) => name.toLowerCase() === RETRY_HEADER,
  );
}

function withRetryHeader(
  options: Parameters<typeof $fetch>[1],
): Parameters<typeof $fetch>[1] {
  const source = options ?? {};
  const merged = { ...source };
  const headers = new Headers(source.headers ?? undefined);
  headers.set(RETRY_HEADER, "1");
  merged.headers = headers;
  return merged;
}

function isUnauthorized(error: unknown): boolean {
  if (!isObject(error) || error === null) return false;
  const { response } = error;
  return (
    isObject(response) &&
    response !== null &&
    response.status === HTTP_UNAUTHORIZED
  );
}

export const useAuthFetch = () => {
  const { loggedIn: isLoggedIn } = useDmsUserSession();
  const { refreshSession, reconcileSession, redirectToAuth } =
    useSessionRecovery();
  const config = useDmsRuntimeConfig();
  const dmsApp = useDmsApp();

  const realtimeSessionId = useDmsState<string | undefined>(
    REALTIME_SESSION_STATE_KEY,
    () => undefined,
  );

  const baseFetch = $fetch.create({
    baseURL: config.public.dms.baseURL,
    onRequest({ options }) {
      if (!options.headers.has(CONTENT_LANGUAGE_HEADER)) {
        options.headers.set(CONTENT_LANGUAGE_HEADER, dmsApp.$i18n.locale.value);
      }
      if (realtimeSessionId.value) {
        options.headers.set(REALTIME_SESSION_HEADER, realtimeSessionId.value);
      }
    },
    async onResponseError({ response, options }) {
      if (response.status !== HTTP_UNAUTHORIZED) {
        return;
      }

      if (isLoggedIn.value && !hasRetryHeader(options?.headers)) {
        return;
      }

      await reconcileSession();
      if (isLoggedIn.value) {
        return;
      }

      await redirectToAuth();
    },
  });

  type AuthFetch = typeof baseFetch;
  type AuthFetchArgs = Parameters<AuthFetch>;

  function withSessionRetry<R>(
    invoke: (
      request: AuthFetchArgs[0],
      options?: AuthFetchArgs[1],
    ) => Promise<R>,
  ) {
    return async (request: AuthFetchArgs[0], options?: AuthFetchArgs[1]) => {
      try {
        return await invoke(request, options);
      } catch (error) {
        const headers = options?.headers;
        if (
          !isUnauthorized(error) ||
          hasRetryHeader(headers) ||
          !isLoggedIn.value
        ) {
          throw error;
        }

        const refreshed = await refreshSession();
        if (!refreshed) {
          throw error;
        }

        return await invoke(request, withRetryHeader(options));
      }
    };
  }

  const retryingFetch = withSessionRetry((request, options) =>
    baseFetch(request, options),
  );
  const retryingRaw = withSessionRetry((request, options) =>
    baseFetch.raw(request, options),
  );

  /**
   * The session-retrying fetch with `defaults` under each call's options, as
   * `$fetch.create` merges them, so a retry resends the options of its first
   * attempt: the call and `raw` retry, `native` is the platform fetch, and
   * `create` adds defaults to a fetch that retries too.
   */
  function withSession(defaults: AuthFetchArgs[1]): AuthFetch {
    const optionsOf = (options?: AuthFetchArgs[1]) => ({
      ...defaults,
      ...options,
    });
    // SAFETY: For every type argument a caller picks, retryingFetch resolves with what baseFetch resolves for the caller's request and its options merged over defaults, responseType included, a 401 retry resending them with only the retry header added; raw, native and create are assigned by the next three statements, before authFetch is returned.
    const authFetch = ((
      request: AuthFetchArgs[0],
      options?: AuthFetchArgs[1],
    ) => retryingFetch(request, optionsOf(options))) as AuthFetch;
    // SAFETY: For every type argument a caller picks, retryingRaw resolves with what baseFetch.raw resolves for the caller's request and its options merged over defaults, responseType included, a 401 retry resending them with only the retry header added.
    authFetch.raw = ((request: AuthFetchArgs[0], options?: AuthFetchArgs[1]) =>
      retryingRaw(request, optionsOf(options))) as AuthFetch["raw"];
    authFetch.native = baseFetch.native;
    authFetch.create = (more) => withSession(optionsOf(more));
    return authFetch;
  }

  return { $authFetch: withSession(undefined) };
};
