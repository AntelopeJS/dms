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
 *
 * The first read comes with the page, like the settings pages' data: a
 * server render waits for it (`await store.ready()`) and hands it over, so
 * the tiles render with their store details and never move once mounted.
 */
export const useModuleStore = () => {
  // Taken once, in setup: the follow-up reads the listing from a timer,
  // outside any component context.
  const { $authFetch } = useAuthFetch();
  const isOwner = useIsOwner();
  // Platform owners only: a member's read would be refused.
  const initial = useApiData<StoreListing>(() =>
    isOwner.value ? ENDPOINT_STORE_LISTING : null,
  );
  // The follow-up reads write into the same data, so a later visit shows
  // the latest listing at once.
  const listing = computed<StoreListing | undefined>({
    get: () => initial.data.value ?? undefined,
    set: (value) => {
      initial.data.value = value ?? null;
    },
  });
  /** The last follow-up read's failure; `null` once one succeeds. */
  const followError = ref<unknown>(undefined);
  const loadingError = computed<unknown>(() =>
    followError.value === undefined
      ? (initial.error.value ?? null)
      : followError.value,
  );
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
      followError.value = null;
    } catch (error) {
      followError.value = error;
    }
    reloadWhenServed();
    scheduleFollow();
  }

  /** Waits for the first read, the one the server renders. */
  async function ready(): Promise<void> {
    await initial;
  }

  /**
   * Starts following once mounted: reads again only when the first read
   * failed, or something moves; a listing already on screen stays as is.
   */
  function start(): void {
    if (!listing.value) {
      void load();
      return;
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
    ready,
    start,
    run,
    stop,
  };
};
