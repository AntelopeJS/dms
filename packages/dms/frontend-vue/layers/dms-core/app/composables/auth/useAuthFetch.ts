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

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This catch boundary accepts arbitrary rejections; ofetch's FetchError owner would exclude supported non-fetch throws.
function isUnauthorized(error: unknown): boolean {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This unchecked optional access preserves primitive boxing and nested getter behavior; a schema guard would change malformed-input behavior.
  const response = (error as { response?: { status?: number } } | undefined)
    ?.response;
  return response?.status === HTTP_UNAUTHORIZED;
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
    // SAFETY: retryingFetch resolves with the response baseFetch gives for the same request, of the same response type, so the wrapper answers as AuthFetch's call signature does; raw, native and create are attached below before it is returned.
    const authFetch = ((
      request: AuthFetchArgs[0],
      options?: AuthFetchArgs[1],
    ) => retryingFetch(request, optionsOf(options))) as AuthFetch;
    // SAFETY: retryingRaw resolves with the response baseFetch.raw gives for the same request, of the same response type, so the wrapper answers as AuthFetch['raw'] does.
    authFetch.raw = ((request: AuthFetchArgs[0], options?: AuthFetchArgs[1]) =>
      retryingRaw(request, optionsOf(options))) as AuthFetch["raw"];
    authFetch.native = baseFetch.native;
    authFetch.create = (more) => withSession(optionsOf(more));
    return authFetch;
  }

  return { $authFetch: withSession(undefined) };
};
