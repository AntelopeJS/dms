export interface OnboardingInfo {
  hasOnboarded: boolean;
}

interface OnboardingInfoResponse {
  has_onboarded: boolean;
}

/**
 * Transferred: the global middleware reads it while a server renders the
 * page, and the browser's run of the middleware then finds it instead of
 * asking again. It holds nothing private.
 */
function useOnboardingCache() {
  return useDmsState<OnboardingInfo | null>("dms-onboarding-info", () => null, {
    transfer: true,
  });
}

export const useOnboarding = async (): Promise<OnboardingInfo> => {
  const cache = useOnboardingCache();

  if (cache.value) return cache.value;

  const { $authFetch } = useAuthFetch();

  const response = await $authFetch<OnboardingInfoResponse>(
    "/api/onboarding/informations",
    { method: "GET" },
  );

  const info: OnboardingInfo = {
    hasOnboarded: response.has_onboarded,
  };

  cache.value = info;
  return info;
};

/** Release the cached onboarding guard after the backend creates the admin. */
export const setOnboardingComplete = () => {
  useOnboardingCache().value = { hasOnboarded: true };
};
