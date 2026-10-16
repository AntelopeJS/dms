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

  const known = cache.value;
  if (known) return known;

  const { $authFetch } = useAuthFetch();

  // One request per app however many callers ask before it answers: the
  // preload started with the app and the `onboarding` middleware share it.
  await useTrailingDeduper("onboarding").join(async () => {
    const response = await $authFetch<OnboardingInfoResponse>(
      "/api/onboarding/informations",
      { method: "GET" },
    );
    cache.value = { hasOnboarded: response.has_onboarded };
  });
  return cache.value as OnboardingInfo;
};

/** Release the cached onboarding guard after the backend creates the admin. */
export const setOnboardingComplete = () => {
  useOnboardingCache().value = { hasOnboarded: true };
};
