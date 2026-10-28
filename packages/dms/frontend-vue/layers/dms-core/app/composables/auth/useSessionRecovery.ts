import { runDeduped } from "../../utils/dedupedRefresh";

const AUTH_PATH = "/auth";
const IN_FLIGHT_REFRESH_KEY = "__dmsAuthInFlightRefresh";

export const useSessionRecovery = () => {
  const dmsApp = useDmsApp();
  const { loggedIn, fetch: fetchSession } = useDmsUserSession();

  const router = useDmsRouter();

  function refreshSession(): Promise<boolean> {
    return runDeduped(
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- DmsAppContext lacks runDeduped's arbitrary property index. Owner-derived holder typing still requires this conversion; preserve the shared app holder without a wrapper or changed identity.
      dmsApp as unknown as Parameters<typeof runDeduped>[0],
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
