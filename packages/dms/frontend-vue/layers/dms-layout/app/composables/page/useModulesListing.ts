type ModulesListingEntry = ModuleInfo & {
  hasAccess: boolean;
  landingSlug: string;
};

const STATE_KEY_MODULES = "dms-modulesListing";
const STATE_KEY_LOADING = "dms-modulesListingLoading";
const STATE_KEY_ERROR = "dms-modulesListingError";
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

let inFlightLoadingPromise: Promise<void> | null = null;

export const useModulesListing = () => {
  const modules = useDmsState<ModulesListingEntry[] | undefined>(
    STATE_KEY_MODULES,
    () => undefined,
  );
  const isLoading = useDmsState<boolean>(STATE_KEY_LOADING, () => false);
  const loadingError = useDmsState<string | null>(STATE_KEY_ERROR, () => null);

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

  async function refresh(): Promise<void> {
    if (inFlightLoadingPromise) {
      await inFlightLoadingPromise;
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
