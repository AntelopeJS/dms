import { runDeduped } from "../../utils/dedupedRefresh";

const AUTH_PATH = "/auth";
const IN_FLIGHT_REFRESH_KEY = "__dmsAuthInFlightRefresh";

export const useSessionRecovery = () => {
  const dmsApp = useDmsApp();
  const { loggedIn, fetch: fetchSession } = useDmsUserSession();

  const router = useDmsRouter();

  function refreshSession(): Promise<boolean> {
    return runDeduped(
      dmsApp as unknown as Record<PropertyKey, unknown>,
      IN_FLIGHT_REFRESH_KEY,
      () =>
        fetchSession()
          .then(() => true)
          .catch(() => false),
    );
  }

  async function reconcileSession(): Promise<void> {
    if (loggedIn.value) {
      await refreshSession();
    }
  }

  async function redirectToAuth(redirect?: string): Promise<void> {
    const route = router.currentRoute.value;
    if (route.path.startsWith(AUTH_PATH)) {
      return;
    }
    redirect ??= route.fullPath;
    await dmsApp.runWithContext(() =>
      navigateDms({
        path: AUTH_PATH,
        query: { redirect },
      }),
    );
  }

  return { loggedIn, refreshSession, reconcileSession, redirectToAuth };
};
