import type {
  StoreActionBody,
  StoreListing,
  StoreListingEntry,
  StoreOperationKind,
} from "../../types/module-store";
import { isAwaitingFrontend } from "../../build/utils/module-store-catalog";

export const ENDPOINT_STORE_LISTING = "/dms/store/listing";
const ENDPOINT_STORE_ACTION = "/dms/store";
/** How often the listing is read while an operation or the frontend runs. */
const FOLLOW_INTERVAL_MS = 1000;

/**
 * The module store of the Modules page: the listing, the operations, and the
 * follow-up that reads the listing again while something moves. An operation
 * the owner started here reloads the page once the frontend serves its
 * result, so a new module's pages appear without a manual refresh.
 */
export const useModuleStore = () => {
  // Taken once, in setup: the follow-up reads the listing from a timer,
  // outside any component context.
  const { $authFetch } = useAuthFetch();
  const listing = ref<StoreListing | undefined>(undefined);
  const loadingError = ref<unknown>(null);
  /** Modules an operation from this page changed, until the frontend follows. */
  const awaitingReload = ref(new Set<string>());
  let followTimer: ReturnType<typeof setTimeout> | undefined;

  const isFollowing = computed(() => {
    const modules = listing.value?.modules ?? [];
    return (
      listing.value?.busy === true ||
      modules.some((entry) => isAwaitingFrontend(entry))
    );
  });

  async function load(): Promise<void> {
    try {
      listing.value = await $authFetch<StoreListing>(ENDPOINT_STORE_LISTING);
      loadingError.value = null;
    } catch (error) {
      loadingError.value = error;
    }
    reloadWhenServed();
    scheduleFollow();
  }

  /**
   * Reloads the page once every module an operation from here changed is
   * served by the frontend (or has no interface at all). A frontend that
   * never reported stays put: the page says what to run instead.
   */
  function reloadWhenServed(): void {
    if (import.meta.env.SSR || awaitingReload.value.size === 0) return;
    const changed = (listing.value?.modules ?? []).filter((entry) =>
      awaitingReload.value.has(entry.id),
    );
    const isSettled = changed.every(
      (entry) =>
        entry.state !== "busy" &&
        (entry.frontend === "synced" || entry.frontend === "none"),
    );
    const needsReload = changed.some((entry) => entry.frontend === "synced");
    if (!isSettled) return;
    awaitingReload.value = new Set();
    if (needsReload) window.location.reload();
  }

  function scheduleFollow(): void {
    if (import.meta.env.SSR) return;
    if (followTimer) clearTimeout(followTimer);
    followTimer = undefined;
    if (!isFollowing.value) return;
    followTimer = setTimeout(() => void load(), FOLLOW_INTERVAL_MS);
  }

  /**
   * Starts `kind` on `entry`, with `body` when it carries more than the id;
   * rejects with the server's answer when refused.
   */
  async function run(
    kind: StoreOperationKind,
    entry: StoreListingEntry,
    body: StoreActionBody = { id: entry.id },
  ): Promise<void> {
    listing.value = await $authFetch<StoreListing>(
      `${ENDPOINT_STORE_ACTION}/${kind}`,
      { method: "POST", body },
    );
    awaitingReload.value = new Set([...awaitingReload.value, entry.id]);
    scheduleFollow();
  }

  function stop(): void {
    if (followTimer) clearTimeout(followTimer);
    followTimer = undefined;
  }

  return {
    listing,
    loadingError,
    isFollowing,
    awaitingReload,
    load,
    run,
    stop,
  };
};
