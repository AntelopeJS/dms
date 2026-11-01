import { isString } from "#dms-core/app/utils/type-check";

const OAUTH_ERROR_QUERY = "oauth_error";
const ERROR_KEY_PREFIX = "error.";
const FALLBACK_ERROR_KEY = "error.oauth.failed";

/**
 * Surface the failure a provider round-trip came back with. The server route
 * cannot raise a toast itself, so it hands the message key over through the
 * query string and clears it once shown.
 *
 * The query value is user-forgeable, so only known error-namespace keys reach
 * the toast — anything else would let a crafted URL display an arbitrary
 * translation, or echo a raw unknown key.
 */
export function useOAuthErrorToast(): void {
  const route = useDmsRoute();
  const router = useDmsRouter();
  const { presentError } = useApiErrorPresenter();

  function toErrorMessageKey(
    value: ReturnType<typeof useDmsRoute>["query"][string],
  ): string | undefined {
    if (!isString(value) || !value) return undefined;
    if (value.startsWith(ERROR_KEY_PREFIX)) return value;
    return FALLBACK_ERROR_KEY;
  }

  onMounted(() => {
    const messageKey = toErrorMessageKey(route.query[OAUTH_ERROR_QUERY]);
    if (!messageKey) return;

    presentError(messageKey, { fallbackKey: FALLBACK_ERROR_KEY });

    const { [OAUTH_ERROR_QUERY]: _consumed, ...query } = route.query;
    void router.replace({ query });
  });
}
