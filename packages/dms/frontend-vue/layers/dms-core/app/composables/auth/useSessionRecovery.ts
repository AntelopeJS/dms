import { runDeduped } from "../../utils/dedupedRefresh";

const AUTH_PATH = "/auth";
const IN_FLIGHT_REFRESH_KEY = "__dmsAuthInFlightRefresh";

type DmsApp = ReturnType<typeof useDmsApp>;
type RefreshHolder = Parameters<typeof runDeduped<boolean>>[0];

/** Per app, the holder `runDeduped` keeps its in-flight session refresh in. */
const refreshHolders = new WeakMap<DmsApp, RefreshHolder>();

function refreshHolderOf(app: DmsApp): RefreshHolder {
  const known = refreshHolders.get(app);
  if (known) return known;
  const holder = {};
  refreshHolders.set(app, holder);
  return holder;
}

export const useSessionRecovery = () => {
  const dmsApp = useDmsApp();
  const userSession = useDmsUserSession();
  const { loggedIn } = userSession;

  const router = useDmsRouter();

  function refreshSession(): Promise<boolean> {
    return runDeduped(refreshHolderOf(dmsApp), IN_FLIGHT_REFRESH_KEY, () =>
      userSession
        .fetch()
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
