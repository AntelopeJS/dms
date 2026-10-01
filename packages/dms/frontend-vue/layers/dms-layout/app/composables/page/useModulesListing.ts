import type { ModuleCatalogEntry } from "../../types/page";

/**
 * Why the catalog could not be loaded: `forbidden` when the server refused
 * the caller (not a platform owner), `failed` for anything else. `status` is
 * the HTTP status when the server answered at all.
 */
export interface ModulesListingError {
  kind: "forbidden" | "failed";
  status?: number;
}

const STATE_KEY_MODULES = "dms-modulesListing";
const STATE_KEY_LOADING = "dms-modulesListingLoading";
const STATE_KEY_ERROR = "dms-modulesListingError";
const STATE_KEY_FETCHED_AT = "dms-modulesListingFetchedAt";
// A listing younger than this is fresh enough to show without refetching:
// it also covers the hydration right after a server render.
const REVALIDATE_AFTER_MS = 30_000;
export const ENDPOINT_MODULES_LISTING = "/dms/modules-listing";

function readStatus(error: unknown): number | undefined {
  const details = error as
    | { response?: { status?: number }; statusCode?: number; status?: number }
    | undefined;
  return details?.response?.status ?? details?.statusCode ?? details?.status;
}

function toListingError(error: unknown): ModulesListingError {
  const status = readStatus(error);
  if (status === HTTP_FORBIDDEN) return { kind: "forbidden", status };
  return { kind: "failed", status };
}

let inFlightLoadingPromise: Promise<void> | null = null;

export const useModulesListing = () => {
  const modules = useDmsState<ModuleCatalogEntry[] | undefined>(
    STATE_KEY_MODULES,
    () => undefined,
  );
  const isLoading = useDmsState<boolean>(STATE_KEY_LOADING, () => false);
  const loadingError = useDmsState<ModulesListingError | null>(
    STATE_KEY_ERROR,
    () => null,
  );
  const fetchedAt = useDmsState<number>(STATE_KEY_FETCHED_AT, () => 0);

  /**
   * Fetches the catalog. With `keepOnFailure`, a failed request leaves the
   * modules already on screen in place (a background revalidation must not
   * blank the page); otherwise the failure replaces them with the error.
   */
  function fetchModulesListing(keepOnFailure = false): Promise<void> {
    const { $authFetch } = useAuthFetch();
    isLoading.value = true;
    if (!keepOnFailure) loadingError.value = null;

    const promise = $authFetch<ModuleCatalogEntry[]>(ENDPOINT_MODULES_LISTING)
      .then((result) => {
        modules.value = result;
        loadingError.value = null;
        fetchedAt.value = Date.now();
      })
      .catch((error: unknown) => {
        const listingError = toListingError(error);
        if (keepOnFailure && listingError.kind === "failed") return;
        loadingError.value = listingError;
        modules.value = undefined;
      })
      .finally(() => {
        isLoading.value = false;
        inFlightLoadingPromise = null;
      });

    inFlightLoadingPromise = promise;
    return promise;
  }

  async function loadModulesListing(): Promise<void> {
    if (inFlightLoadingPromise) {
      await inFlightLoadingPromise;
      return;
    }
    if (modules.value !== undefined) {
      return;
    }
    await fetchModulesListing();
  }

  /**
   * Loads the catalog again on request (Refresh, Try again): the current list
   * stays on screen while loading, and a failure is shown, not swallowed.
   */
  async function refresh(): Promise<void> {
    if (inFlightLoadingPromise) {
      await inFlightLoadingPromise;
    }
    await fetchModulesListing();
  }

  /**
   * Reloads statuses and readouts while keeping the current list on screen,
   * unless the listing is only a few seconds old: readouts are live figures,
   * so a later revisit should not show stale ones.
   */
  async function revalidate(): Promise<void> {
    if (inFlightLoadingPromise) {
      await inFlightLoadingPromise;
      return;
    }
    if (Date.now() - fetchedAt.value < REVALIDATE_AFTER_MS) return;
    await fetchModulesListing(true);
  }

  return {
    modules,
    isLoading,
    loadingError,
    loadModulesListing,
    refresh,
    revalidate,
  };
};
