const PERMISSIONS_REFRESH_MS = 300_000;
const PERMISSIONS_ENDPOINT = "/dms/permissions";
const WILDCARD_PERMISSION = "*";

interface PermissionsState {
  permissions: Ref<Set<string>>;
  isLoaded: Ref<boolean>;
  lastFetchTime: Ref<number>;
  fetchGeneration: Ref<number>;
}

// The set a server render loads (the `auth` middleware preloads it before the
// page renders) is the one the page renders with: the browser starts from it
// rather than asking again, and its age keeps counting from the server's load.
// The generation only guards the runs in flight of one side.
const TRANSFERRED = { transfer: true };

function usePermissionsState(): PermissionsState {
  return {
    permissions: useDmsState<Set<string>>(
      "dms-user-permissions",
      () => new Set(),
      TRANSFERRED,
    ),
    isLoaded: useDmsState<boolean>(
      "dms-permissions-loaded",
      () => false,
      TRANSFERRED,
    ),
    lastFetchTime: useDmsState<number>(
      "dms-permissions-lastFetch",
      () => 0,
      TRANSFERRED,
    ),
    fetchGeneration: useDmsState<number>("dms-permissions-gen", () => 0),
  };
}

function createFetchPermissions(state: PermissionsState) {
  const runFetch = async () => {
    const generation = state.fetchGeneration.value;
    const { $authFetch } = useAuthFetch();
    const result = await $authFetch<string[]>(PERMISSIONS_ENDPOINT);
    if (state.fetchGeneration.value !== generation) return;
    state.permissions.value = new Set(result);
    state.isLoaded.value = true;
    state.lastFetchTime.value = Date.now();
  };

  // A refetch asked while one is in flight gets its own pass instead of the
  // older response, so an invalidation is never swallowed. Scoped to the DMS
  // app, so concurrent server-rendered requests never share a pass.
  const deduper = useTrailingDeduper("permissions");
  const fetchPermissions = (): Promise<void> => deduper.run(runFetch);
  // A caller that only needs a set has nothing to invalidate: it joins the
  // load in flight instead of queueing a second one.
  const loadPermissions = async (): Promise<void> => {
    if (state.isLoaded.value) return;
    await deduper.join(runFetch);
    // The run it joined was started before a `clear()` (another account):
    // its answer was dropped, and this caller still needs one.
    if (!state.isLoaded.value) await deduper.join(runFetch);
  };
  return { fetchPermissions, loadPermissions };
}

export function usePermissions() {
  const state = usePermissionsState();
  const { fetchPermissions, loadPermissions } = createFetchPermissions(state);

  async function refreshIfStale() {
    const elapsed = Date.now() - state.lastFetchTime.value;
    if (elapsed < PERMISSIONS_REFRESH_MS) {
      return;
    }
    await fetchPermissions();
  }

  function hasPermission(permissionId: string): boolean {
    if (state.permissions.value.has(WILDCARD_PERMISSION)) {
      return true;
    }
    return state.permissions.value.has(permissionId);
  }

  function clear() {
    state.fetchGeneration.value++;
    state.permissions.value = new Set();
    state.isLoaded.value = false;
    state.lastFetchTime.value = 0;
  }

  return {
    permissions: state.permissions,
    isLoaded: state.isLoaded,
    fetchPermissions,
    loadPermissions,
    refreshIfStale,
    hasPermission,
    clear,
  };
}
