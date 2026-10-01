type ModulesListingEntry = ModuleInfo & {
  hasAccess: boolean;
  landingSlug: string;
};

const STATE_KEY_MODULES = "dms-modulesListing";
const STATE_KEY_LOADING = "dms-modulesListingLoading";
const STATE_KEY_ERROR = "dms-modulesListingError";
const IN_FLIGHT_MODULES_LISTING_KEY = "__dmsInFlightModulesListing";
const ENDPOINT_MODULES_LISTING = "/dms/modules-listing";
const ERROR_FORBIDDEN_MESSAGE = "Forbidden: only owners can list modules";
const ERROR_UNKNOWN_MESSAGE = "Unknown error loading modules listing";

function isForbiddenError(error: unknown): boolean {
  const status = error as
    | { response?: { status?: number }; statusCode?: number }
    | undefined;
  if (!status) return false;
  if (status.response?.status === HTTP_FORBIDDEN) return true;
  if (status.statusCode === HTTP_FORBIDDEN) return true;
  return false;
}

function extractErrorMessage(error: unknown): string {
  if (isForbiddenError(error)) return ERROR_FORBIDDEN_MESSAGE;
  if (error instanceof Error) return error.message;
  return ERROR_UNKNOWN_MESSAGE;
}

export const useModulesListing = () => {
  const modules = useDmsState<ModulesListingEntry[] | undefined>(
    STATE_KEY_MODULES,
    () => undefined,
  );
  const isLoading = useDmsState<boolean>(STATE_KEY_LOADING, () => false);
  const loadingError = useDmsState<string | null>(STATE_KEY_ERROR, () => null);

  // Held on the DMS app, like the in-flight fetches of useSiteLayout: every
  // caller writes the same listing state, so they share one fetch. Not module
  // scope, which the server shares across the requests it renders at once: a
  // second render would wait on the first one's fetch, whose answer lands in
  // the first request's state, and render an empty listing.
  const dmsApp = useDmsApp() as unknown as Record<PropertyKey, unknown>;
  const inFlightLoadingPromise = {
    get value(): Promise<void> | null {
      return (dmsApp[IN_FLIGHT_MODULES_LISTING_KEY] as Promise<void>) ?? null;
    },
    set value(promise: Promise<void> | null) {
      dmsApp[IN_FLIGHT_MODULES_LISTING_KEY] = promise;
    },
  };

  function fetchModulesListing(): Promise<void> {
    const { $authFetch } = useAuthFetch();
    isLoading.value = true;
    loadingError.value = null;

    const promise = $authFetch<ModulesListingEntry[]>(ENDPOINT_MODULES_LISTING)
      .then((result) => {
        modules.value = result;
      })
      .catch((error: unknown) => {
        loadingError.value = extractErrorMessage(error);
        modules.value = undefined;
      })
      .finally(() => {
        isLoading.value = false;
        inFlightLoadingPromise.value = null;
      });

    inFlightLoadingPromise.value = promise;
    return promise;
  }

  async function loadModulesListing(): Promise<void> {
    if (inFlightLoadingPromise.value) {
      await inFlightLoadingPromise.value;
      return;
    }
    if (modules.value !== undefined) {
      return;
    }
    await fetchModulesListing();
  }

  async function refresh(): Promise<void> {
    if (inFlightLoadingPromise.value) {
      await inFlightLoadingPromise.value;
    }
    modules.value = undefined;
    loadingError.value = null;
    await fetchModulesListing();
  }

  return {
    modules,
    isLoading,
    loadingError,
    loadModulesListing,
    refresh,
  };
};
