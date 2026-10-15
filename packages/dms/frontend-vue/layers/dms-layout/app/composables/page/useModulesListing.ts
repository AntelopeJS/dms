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

/**
 * The modules catalog of the Modules page, read for platform owners only (a
 * member's request would be refused): with the page, so a server render
 * shows it and hands it to the browser, which does not ask again.
 */
export const useModulesListing = () => {
  const isOwner = useIsOwner();
  const listing = useApiData<ModuleCatalogEntry[]>(() =>
    isOwner.value ? ENDPOINT_MODULES_LISTING : null,
  );

  const loadingError = computed<ModulesListingError | null>(() =>
    listing.error.value ? toListingError(listing.error.value) : null,
  );
  // A failed read replaces the modules with the error.
  const modules = computed<ModuleCatalogEntry[] | undefined>(() =>
    loadingError.value ? undefined : (listing.data.value ?? undefined),
  );

  return {
    modules,
    isLoading: listing.pending,
    loadingError,
    /** Waits for the catalog to be read. */
    loadModulesListing: async (): Promise<void> => {
      await listing;
    },
    /**
     * Reads the catalog again (Refresh, Try again): the current list stays
     * on screen while loading, and a failure is shown, not swallowed.
     */
    refresh: (): Promise<void> => listing.refresh(),
  };
};
