import type { ModuleCatalogEntry } from "#dms-core/app/types/page";
import { isNumber, isObject } from "#dms-core/app/utils/type-check";

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

function numberOrUndefined(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined;
}

/** The HTTP status a failed request carries: its response's, else its own. */
function readStatus(error: unknown): number | undefined {
  if (error === null || !isObject(error)) return undefined;
  const { response } = error;
  const responseStatus =
    response !== null && isObject(response)
      ? numberOrUndefined(response.status)
      : undefined;
  return (
    responseStatus ??
    numberOrUndefined(error.statusCode) ??
    numberOrUndefined(error.status)
  );
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
