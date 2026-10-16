import { pageRoutePath } from "#dms-core/app/utils/pageRoutes";
const PROFILE_ENDPOINT = pageRoutePath("/settings/user/profile");

/**
 * Switches the interface language and stores it on the user's profile, then
 * reads the session again: the interface follows the session's language, so
 * it would otherwise revert to the previously stored one. Every language
 * switcher goes through it.
 */
export function useUserLanguage() {
  const dmsApp = useDmsApp();
  const { $authFetch } = useAuthFetch();
  const { user, fetch: refreshUser } = useDmsUserSession();

  async function changeLanguage(language: string): Promise<void> {
    await dmsApp.$i18n.setLocale(language);

    try {
      await $authFetch(PROFILE_ENDPOINT, {
        method: "POST",
        body: {
          name: user.value?.name,
          email: user.value?.email,
          language,
        },
      });

      await refreshUser();
    } catch {
      /* ignore — silently skip the update on network / backend errors */
    }
  }

  return { changeLanguage };
}
