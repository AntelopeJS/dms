import { runDeduped } from "../../utils/dedupedRefresh";

const AUTH_PATH = "/auth";
const IN_FLIGHT_REFRESH_KEY = "__dmsAuthInFlightRefresh";

export const useSessionRecovery = () => {
  const dmsApp = useDmsApp();
  const { loggedIn, fetch: fetchSession } = useUserSession();
  // useDmsRoute() must not be called here: this composable runs inside route
  // middleware (via useAuthFetch), where the DMS runtime warns that useDmsRoute is
  // misleading. Resolve the route lazily from the router instead.
  const router = useDmsRouter();

  // Refresh the user session at most once concurrently (see runDeduped): the
  // realtime stream, $authFetch and route middleware can all hit a 401 at the
  // same time, and parallel /api/auth/refresh calls with the same rotating
  // refresh token would invalidate the session and log the user out.
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
