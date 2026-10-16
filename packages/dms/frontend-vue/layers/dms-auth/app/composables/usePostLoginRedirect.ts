type PostLoginDestination = string | (() => string | undefined);

interface PostLoginRedirectOptions {
  /**
   * Open the destination in place of the current page in the history. For a
   * page that consumed a one-time sign-in token (the OAuth completion, the
   * second factor): back on it, the user would only meet a dead token, or a
   * page sending them forward again.
   */
  replace?: boolean;
}

/** Refresh authenticated state before resolving and opening the destination. */
export async function usePostLoginRedirect(
  redirectUrl?: PostLoginDestination,
  options: PostLoginRedirectOptions = {},
) {
  const dmsApp = useDmsApp();
  const { fetch: refreshUser, user } = useDmsUserSession();
  const { addCurrentAccount } = useMultiAccount();
  const siteLayout = useSiteLayout();
  const homepage = useHomepage();

  await refreshUser();
  if (!user.value) {
    throw new Error(
      "Unable to load the authenticated session. Please sign in again.",
    );
  }
  addCurrentAccount();

  await siteLayout.refresh();

  if (user.value?.language) {
    await dmsApp.$i18n.setLocale(user.value.language as "en" | "fr");
  }

  const destination =
    typeof redirectUrl === "function" ? redirectUrl() : redirectUrl;
  await navigateDms(destination || homepage, options);
}
