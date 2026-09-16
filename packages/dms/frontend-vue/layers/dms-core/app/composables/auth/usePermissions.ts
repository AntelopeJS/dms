const PERMISSIONS_REFRESH_MS = 300_000;
const PERMISSIONS_ENDPOINT = "/dms/permissions";
const WILDCARD_PERMISSION = "*";

interface PermissionsState {
  permissions: Ref<Set<string>>;
  isLoaded: Ref<boolean>;
  lastFetchTime: Ref<number>;
  fetchGeneration: Ref<number>;
}

function usePermissionsState(): PermissionsState {
  return {
    permissions: useDmsState<Set<string>>("dms-user-permissions", () => new Set()),
    isLoaded: useDmsState<boolean>("dms-permissions-loaded", () => false),
    lastFetchTime: useDmsState<number>("dms-permissions-lastFetch", () => 0),
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
  // older response, so an invalidation is never swallowed. Scoped to the DMS app
  // app, so concurrent server-rendered requests never share a pass.
  const deduper = useTrailingDeduper("permissions");
  return (): Promise<void> => deduper.run(runFetch);
}

export function usePermissions() {
  const state = usePermissionsState();
  const fetchPermissions = createFetchPermissions(state);

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
    refreshIfStale,
    hasPermission,
    clear,
  };
}
