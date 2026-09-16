import type { UseFetchOptions } from "#dms-inertia/frontend-module";

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

function withRetryHeader<O>(options: O): O {
  const source = (options ?? {}) as { headers?: HeadersInit } & Record<
    string,
    unknown
  >;
  const merged: Record<string, unknown> = { ...source };
  const headers = new Headers(source.headers ?? undefined);
  headers.set(RETRY_HEADER, "1");
  merged.headers = headers;
  return merged as O;
}

function isUnauthorized(error: unknown): boolean {
  const response = (error as { response?: { status?: number } } | undefined)
    ?.response;
  return response?.status === HTTP_UNAUTHORIZED;
}

export const useAuthFetch = () => {
  const { loggedIn: isLoggedIn } = useUserSession();
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
    headers: {
      [CONTENT_LANGUAGE_HEADER]: dmsApp.$i18n.locale.value,
    },
    onRequest({ options }) {
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
        const headers = (options as { headers?: HeadersInit } | undefined)
          ?.headers;
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

  const $authFetch = withSessionRetry((request, options) =>
    baseFetch(request, options),
  ) as AuthFetch;
  $authFetch.raw = withSessionRetry((request, options) =>
    baseFetch.raw(request, options),
  ) as AuthFetch["raw"];

  function useFetchAuth<T>(
    url: string | (() => string),
    options?: UseFetchOptions<T>,
  ) {
    return useDmsFetch(url, {
      ...options,
      $fetch: $authFetch,
    });
  }

  return {
    $authFetch,
    useFetchAuth,
  };
};
