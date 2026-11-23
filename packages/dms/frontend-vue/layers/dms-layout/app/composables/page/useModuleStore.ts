import type {
  StoreActionBody,
  StoreListing,
  StoreListingEntry,
  StoreOperationKind,
} from "#dms-core/app/types/module-store";
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
 * The first read comes with the page (`useApiData`): a server render waits
 * for it and hands it over, so the tiles render with their store details and
 * never move once mounted.
 *
 * A frontend that never reports keeps the page as is: the page says what to
 * run instead.
 */
export const useModuleStore = () => {
  const { $authFetch } = useAuthFetch();
  const errorPresenter = useApiErrorPresenter();
  const isOwner = useIsOwner();

  const initial = useApiData<StoreListing>(() =>
    isOwner.value ? ENDPOINT_STORE_LISTING : null,
  );

  const listing = computed<StoreListing | undefined>({
    get: () => initial.data.value ?? undefined,
    set: (value) => {
      initial.data.value = value ?? null;
    },
  });
  const followError = ref<unknown>(undefined);
  const loadingError = computed<unknown>(() =>
    followError.value === undefined
      ? (initial.error.value ?? null)
      : followError.value,
  );
  const loadingNotice = computed(() =>
    loadingError.value
      ? errorPresenter.resolveError(loadingError.value, {
          fallbackKey: "modules.store.load_error",
        })
      : null,
  );
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

  let isStopped = false;
  let stopWaiting: (() => void) | undefined;

  function start(): void {
    isStopped = false;
    stopWaiting?.();
    if (initial.pending.value) {
      stopWaiting = watch(initial.pending, (pending) => {
        if (pending) return;
        stopWaiting?.();
        stopWaiting = undefined;
        if (!isStopped) start();
      });
      return;
    }
    if (!listing.value) {
      load().catch(() => undefined);
      return;
    }
    reloadWhenServed();
    scheduleFollow();
  }

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
    isStopped = true;
    stopWaiting?.();
    stopWaiting = undefined;
    if (followTimer) clearTimeout(followTimer);
    followTimer = undefined;
  }

  return {
    listing,
    loadingError,
    loadingNotice,
    isFollowing,
    awaitingReload,
    load,
    start,
    run,
    stop,
  };
};
