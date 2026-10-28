import { computed, effectScope } from "vue";

const PERMISSIONS_REFRESH_MS = 300_000;
const PERMISSIONS_ENDPOINT = "/dms/permissions";
const WILDCARD_PERMISSION = "*";

/**
 * The async data key of the permission set, in the account and workspace's
 * scope like every key: a switch of either drops the set. The set a server
 * render loads (the `auth` middleware's, preloaded as the app starts) is the
 * one the page renders with, and the page hands it to the browser, which
 * starts from it rather than asking again.
 */
const PERMISSIONS_KEY = "dms-permissions";

/** The permission set, and when it was read: its age counts from there. */
interface LoadedPermissions {
  ids: string[];
  loadedAt: number;
}

/**
 * The set's async data. Only the calls below start a read: a component that
 * shows the set reads it through `useDmsData`, which never reads it again on
 * a mount. Out of the page's refreshes: it has triggers of its own.
 */
function permissionsData(immediate = true) {
  return useApiData<LoadedPermissions>(
    PERMISSIONS_KEY,
    async ({ $authFetch, signal }) => ({
      ids: await $authFetch<string[]>(PERMISSIONS_ENDPOINT, { signal }),
      loadedAt: Date.now(),
    }),
    { immediate, refreshOnPageRefresh: false },
  );
}

export function usePermissions() {
  const loaded = useDmsData<LoadedPermissions>(PERMISSIONS_KEY).data;
  const permissions = computed(() => new Set(loaded.value?.ids ?? []));
  const isLoaded = computed(() => loaded.value != null);

  async function loadPermissions(): Promise<void> {
    for (let attempt = 0; attempt < 2 && !loaded.value; attempt++) {
      const result = await permissionsData();
      if (!result.data.value && result.error.value) throw result.error.value;
    }
  }

  async function fetchPermissions(): Promise<void> {
    if (loaded.value) await refreshLoadedSet();
    else await refreshDmsData(PERMISSIONS_KEY);
    await loadPermissions();
  }

  async function refreshLoadedSet(): Promise<void> {
    const scope = effectScope(true);
    const data = scope.run(() => permissionsData(false))!;
    try {
      await data.refresh();
    } finally {
      scope.stop();
    }

    if (data.status.value === "error") throw data.error.value;
  }

  async function refreshIfStale() {
    const set = loaded.value;
    if (set && Date.now() - set.loadedAt < PERMISSIONS_REFRESH_MS) return;
    await fetchPermissions();
  }

  function hasPermission(permissionId: string): boolean {
    const set = permissions.value;
    return set.has(WILDCARD_PERMISSION) || set.has(permissionId);
  }

  function clear() {
    permissionsData(false).clear();
  }

  return {
    permissions,
    isLoaded,
    fetchPermissions,
    loadPermissions,
    refreshIfStale,
    hasPermission,
    clear,
  };
}
