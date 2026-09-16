const DEV_RELOAD_STATE_KEY = "dms:dev-reloading";
const DEV_RELOAD_HOLDER_KEY = "__dmsDevReload";

const ROUTE_READY_POLL_INTERVAL_MS = 150;
const ROUTE_READY_TIMEOUT_MS = 15000;
const ROUTE_READY_INITIAL_DELAY_MS = 150;
// Outside dev nothing in this file re-fetches the site layout, so a long wait
// could only ever stall the caller. Cap it: either a refresh started elsewhere
// lands within the moment, or the answer is "not served".
const PRODUCTION_ROUTE_WAIT_MS = 2000;
// Comfortably past the route-ready deadline: this only catches a refresh that
// never settles at all, not a slow one.
const RELOAD_FLAG_MAX_MS = ROUTE_READY_TIMEOUT_MS + 5000;

/**
 * Whether a dev hot reload is in flight. A module re-registers its pages one at
 * a time, so the page the user is on can be missing for a moment. Raising a 404
 * then would flash an error the reload is about to fix, so the renderer holds
 * off while this is true.
 *
 * Internal state: it drives the 404 suppression and nothing else. It is never
 * rendered — the current page stays mounted and the new layout is applied in
 * place, so the add/remove/update animations play as usual.
 */
export const useDevReloading = () =>
  useDmsState<boolean>(DEV_RELOAD_STATE_KEY, () => false);

/** Everything the coordinator needs from the surrounding DMS app. */
export interface DevReloadDeps {
  /** True when the committed site layout already serves `path`. */
  isRouteKnown: (path: string) => boolean;
  /**
   * Fetch a fresh site layout and commit it only if it serves `path`; false
   * while the route is still missing. Dev-only, see `useSiteLayout`.
   */
  probeAndCommitRoute: (path: string) => Promise<boolean>;
  /** Commit whatever the backend serves now, route present or not. */
  commitLayout: () => Promise<void>;
  /** Refresh everything hanging off the committed layout, for `path`. */
  refreshDerived: (path: string) => Promise<void>;
  /** Drop the transient 404 raised while `path` was unregistered. */
  clearTransient404: (path: string) => void;
  /** The route the user is on right now. */
  currentPath: () => string;
  setReloading: (value: boolean) => void;
  isDev: boolean;
  /** Clock and sleep, injected so the loops can be driven in a test. */
  delay: (ms: number) => Promise<void>;
  now: () => number;
}

export interface AwaitRouteOptions {
  /** Give up after this many milliseconds. Defaults to 15000. */
  timeoutMs?: number;
}

export interface DevReloadCoordinator {
  /**
   * Run a soft refresh for `path` (default: the current route) and resolve with
   * whether the committed layout serves it. Coalesces: a call made while a
   * refresh is in flight joins it and books exactly one trailing re-run.
   */
  requestRefresh: (path?: string) => Promise<boolean>;
  awaitRoute: (path: string, options?: AwaitRouteOptions) => Promise<boolean>;
  settled: () => Promise<void>;
}

/** The one polling loop. `step` decides what "ready" means for its caller. */
async function pollUntil(
  step: () => boolean | Promise<boolean>,
  deadline: number,
  timing: Pick<DevReloadDeps, "delay" | "now">,
): Promise<boolean> {
  for (;;) {
    if (await step()) return true;
    if (timing.now() >= deadline) return false;
    await timing.delay(ROUTE_READY_POLL_INTERVAL_MS);
  }
}

// Hold the refresh until the route actually resolves in a freshly fetched
// layout, then commit THAT layout atomically. A hot reload re-registers modules
// one at a time (and can do so more than once in quick succession), so the
// backend can be reachable while the page is momentarily unregistered.
// Committing then would drop the page and 404 it. probeAndCommitRoute fetches
// once and only commits if the route is present, so the check and the commit
// cannot be split by a second unregister burst. If the route never comes back
// (page genuinely deleted), we time out and commit whatever the backend now
// has, letting the page component handle the 404.
async function commitWhenRouteReady(
  path: string,
  deadline: number,
  deps: DevReloadDeps,
  timing: Pick<DevReloadDeps, "delay" | "now">,
): Promise<boolean> {
  await timing.delay(ROUTE_READY_INITIAL_DELAY_MS);
  const committed = await pollUntil(
    () => deps.probeAndCommitRoute(path),
    deadline,
    timing,
  );
  if (!committed) {
    console.warn(
      "[dms-dev-reload] Route readiness timed out, refreshing anyway",
    );
  }
  return committed;
}

async function softRefresh(
  path: string,
  deadline: number,
  deps: DevReloadDeps,
  timing: Pick<DevReloadDeps, "delay" | "now">,
): Promise<boolean> {
  const committed = await commitWhenRouteReady(path, deadline, deps, timing);
  if (!committed) await deps.commitLayout();
  await deps.refreshDerived(path);
  if (committed) deps.clearTransient404(path);
  return committed;
}

/**
 * The single dev-reload mechanism, with its dependencies passed in so it can be
 * exercised without a DMS app runtime.
 *
 * Both entry points — the SSE `reload` event and a module's `awaitRoute` —
 * funnel through the same route-readiness loop and the same in-flight refresh,
 * so a module never polls the layout on its own and never races the plugin with
 * a second fetch loop.
 */
/**
 * Everything the loops below share: the app they drive, the clock they read,
 * and the one in-flight pass they coalesce on.
 */
interface CoordinatorState {
  deps: DevReloadDeps;
  refreshing: Promise<boolean> | null;
  /**
   * A reload event can arrive while a previous refresh is still polling for its
   * route. Rather than drop it, remember that one more pass is owed and run it
   * once the in-flight pass settles -- re-reading the current route at that
   * point, since the user may have navigated meanwhile (polling a stale
   * captured path would waste the whole timeout). Coalesces a burst into a
   * single trailing re-run.
   */
  rerunPending: boolean;
}

function handOverToRerun(state: CoordinatorState): boolean {
  if (!state.rerunPending) return false;
  state.rerunPending = false;
  // The re-run owns the reloading flag from here.
  void runRefresh(
    state,
    state.deps.currentPath(),
    state.deps.now() + ROUTE_READY_TIMEOUT_MS,
  );
  return true;
}

function runRefresh(
  state: CoordinatorState,
  path: string,
  deadline: number,
): Promise<boolean> {
  const { deps } = state;
  deps.setReloading(true);
  // A refresh that never settles would leave the flag set, and the flag
  // suppresses 404s -- every later missing page would come up blank for the
  // rest of the session. Release it on a deadline regardless.
  const release = setTimeout(() => {
    deps.setReloading(false);
  }, RELOAD_FLAG_MAX_MS);
  const started: Promise<boolean> = softRefresh(path, deadline, deps, deps)
    .catch((err: unknown) => {
      console.error("[dms-dev-reload] Soft refresh failed:", err);
      return false;
    })
    .finally(() => {
      clearTimeout(release);
      if (state.refreshing === started) state.refreshing = null;
      if (!handOverToRerun(state)) deps.setReloading(false);
    });
  state.refreshing = started;
  return started;
}

function requestRefresh(
  state: CoordinatorState,
  path?: string,
): Promise<boolean> {
  if (state.refreshing) {
    state.rerunPending = true;
    return state.refreshing;
  }
  const { deps } = state;
  return runRefresh(
    state,
    path ?? deps.currentPath(),
    deps.now() + ROUTE_READY_TIMEOUT_MS,
  );
}

/**
 * Joins passes until none is running or `stop` says so. A settling refresh may
 * hand over to a booked re-run, which is still "in flight"; the identity check
 * makes the loop terminate as soon as no new pass is started.
 */
async function joinInFlight(
  state: CoordinatorState,
  stop: () => boolean,
): Promise<void> {
  let joined: Promise<boolean> | null = null;
  while (state.refreshing && state.refreshing !== joined && !stop()) {
    joined = state.refreshing;
    await joined.catch(() => undefined);
  }
}

function settled(state: CoordinatorState): Promise<void> {
  return joinInFlight(state, () => false);
}

function awaitRouteDeadline(
  deps: DevReloadDeps,
  options?: AwaitRouteOptions,
): number {
  const timeoutMs = options?.timeoutMs ?? ROUTE_READY_TIMEOUT_MS;
  return (
    deps.now() +
    (deps.isDev ? timeoutMs : Math.min(timeoutMs, PRODUCTION_ROUTE_WAIT_MS))
  );
}

async function awaitRoute(
  state: CoordinatorState,
  path: string,
  options?: AwaitRouteOptions,
): Promise<boolean> {
  const { deps } = state;
  if (deps.isRouteKnown(path)) return true;
  const deadline = awaitRouteDeadline(deps, options);

  // A refresh already in flight is re-committing the whole layout, which may be
  // all this caller needs; join it instead of racing it with a second fetch
  // loop.
  await joinInFlight(
    state,
    () => deps.isRouteKnown(path) || deps.now() >= deadline,
  );
  if (deps.isRouteKnown(path)) return true;

  // Outside dev there is no reload stream and probeAndCommitRoute is a no-op,
  // so the only thing that can bring the route in is a refresh driven
  // elsewhere. Watch the committed layout for a moment, then answer.
  if (!deps.isDev) {
    return pollUntil(() => deps.isRouteKnown(path), deadline, deps);
  }

  // Deadline spent waiting on someone else's pass.
  if (state.refreshing || deps.now() >= deadline) return deps.isRouteKnown(path);

  const committed = await runRefresh(state, path, deadline);
  // A trailing re-run booked over ours may be the one that brought the route
  // in, so re-read the committed layout rather than trusting our own answer.
  return committed || deps.isRouteKnown(path);
}

/**
 * The single dev-reload mechanism, with its dependencies passed in so it can be
 * exercised without a DMS app runtime.
 *
 * Both entry points -- the SSE `reload` event and a module's `awaitRoute` --
 * funnel through the same route-readiness loop and the same in-flight refresh,
 * so a module never polls the layout on its own and never races the plugin with
 * a second fetch loop.
 */
export function createDevReloadCoordinator(
  deps: DevReloadDeps,
): DevReloadCoordinator {
  const state: CoordinatorState = {
    deps,
    refreshing: null,
    rerunPending: false,
  };
  return {
    requestRefresh: (path?: string) => requestRefresh(state, path),
    awaitRoute: (path: string, options?: AwaitRouteOptions) =>
      awaitRoute(state, path, options),
    settled: () => settled(state),
  };
}

// Refresh everything that hangs off the site layout, AFTER the layout itself
// has been (re)committed for the current route. Kept separate from the layout
// commit so the commit can stay atomic with its route check (see
// probeAndCommitRoute) — the 404-prone part was committing the layout, not this.
async function postLayoutRefresh(currentRoutePath: string): Promise<void> {
  const permissions = usePermissions();
  // fetchPermissions() refetches and swaps the set atomically, so there is no
  // need to clear() first — clearing would briefly empty permissions and flash
  // permission-gated UI.
  await permissions.fetchPermissions();
  await refreshDmsData(currentRoutePath);
  await refreshDmsData(`layout-${currentRoutePath}`);
}

interface DevReloadHolder {
  coordinator: DevReloadCoordinator;
  reloading: Ref<boolean>;
}

/**
 * The app-wide coordinator. Held on the DMS app rather than in a per-call ref:
 * every caller has to see the same in-flight refresh, or they would each run
 * their own fetch loop and the older answer could land last. Same holder as the
 * site layout's in-flight fetch (see `useSiteLayout`).
 *
 * Core-internal — module frontends use {@link useDmsDevReload}.
 */
export function useDevReloadHolder(): DevReloadHolder {
  const dmsApp = useDmsApp() as unknown as Record<PropertyKey, unknown>;
  const existing = dmsApp[DEV_RELOAD_HOLDER_KEY] as DevReloadHolder | undefined;
  if (existing) return existing;

  // Outside dev the flag is a plain ref rather than shared state, so the key
  // never reaches a production SSR payload.
  const reloading = import.meta.env.DEV ? useDevReloading() : ref(false);
  const siteLayout = useSiteLayout();
  const router = useDmsRouter();
  const currentError = useError();

  const coordinator = createDevReloadCoordinator({
    isDev: import.meta.env.DEV,
    currentPath: () => router.currentRoute.value.path,
    isRouteKnown: (path) => siteLayout.findMatchingRoute(path) !== null,
    probeAndCommitRoute: (path) => siteLayout.probeAndCommitRoute(path),
    commitLayout: () => siteLayout.refresh(),
    refreshDerived: postLayoutRefresh,
    // Clear the transient 404 [...slug].vue raised while the route was briefly
    // unregistered, so the page re-renders once the route is committed again.
    // Only when the user is still on the path we recovered — otherwise they
    // navigated to a genuinely missing route meanwhile and that 404 must stand.
    clearTransient404: (recoveredPath) => {
      if (router.currentRoute.value.path !== recoveredPath) return;
      const err = currentError.value;
      if (!err || err.statusCode !== HTTP_NOT_FOUND) return;
      void clearError();
    },
    setReloading: (value) => {
      reloading.value = value;
    },
    now: () => Date.now(),
    delay: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  });

  const holder: DevReloadHolder = { coordinator, reloading };
  dmsApp[DEV_RELOAD_HOLDER_KEY] = holder;
  return holder;
}

export interface DmsDevReload {
  /**
   * Whether a dev reload is in flight. Internal state — never render it: the
   * point of this mechanism is that a reload is invisible.
   */
  reloading: Readonly<Ref<boolean>>;
  /** Resolves once no refresh is in flight. */
  settled: () => Promise<void>;
  /**
   * Resolves `true` once the committed site layout serves `path`, `false` on
   * timeout (default 15000 ms).
   */
  awaitRoute: (path: string, options?: AwaitRouteOptions) => Promise<boolean>;
}

/**
 * Wait for the DMS to catch up with a backend change, from a module frontend.
 *
 * Writing a page from the no-code builder or the AI chatbox reloads the backend
 * module, which re-registers its pages one at a time; navigating straight away
 * would land on a route the site layout does not serve yet. `awaitRoute` holds
 * until it does, sharing the core's refresh rather than polling the layout
 * state on its own.
 *
 * ```ts
 * const { awaitRoute } = useDmsDevReload();
 * await createPage(path);
 * await awaitRoute(path);
 * await navigateDms(path);
 * ```
 */
export const useDmsDevReload = (): DmsDevReload => {
  const { coordinator, reloading } = useDevReloadHolder();
  return {
    reloading,
    settled: coordinator.settled,
    awaitRoute: coordinator.awaitRoute,
  };
};
