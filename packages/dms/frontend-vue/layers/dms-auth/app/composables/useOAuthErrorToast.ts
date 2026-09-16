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
  const toast = useToast();
  const { t, te } = useI18n();

  function toErrorMessageKey(value: unknown): string | undefined {
    if (typeof value !== "string" || !value) return undefined;
    if (value.startsWith(ERROR_KEY_PREFIX) && te(value)) return value;
    return FALLBACK_ERROR_KEY;
  }

  onMounted(() => {
    const messageKey = toErrorMessageKey(route.query[OAUTH_ERROR_QUERY]);
    if (!messageKey) return;

    toast.add({
      title: t("page.auth.error_title"),
      description: t(messageKey),
      color: "error",
    });

    const { [OAUTH_ERROR_QUERY]: _consumed, ...query } = route.query;
    void router.replace({ query });
  });
}
