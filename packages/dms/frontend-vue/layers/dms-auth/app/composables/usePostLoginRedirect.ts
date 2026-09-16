type PostLoginDestination = string | (() => string | undefined);

/** Refresh authenticated state before resolving and opening the destination. */
export async function usePostLoginRedirect(redirectUrl?: PostLoginDestination) {
  const dmsApp = useDmsApp();
  const { fetch: refreshUser, user } = useUserSession();
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
  await navigateDms(destination || homepage);
}
