export interface OnboardingInfo {
  hasOnboarded: boolean;
}

interface OnboardingInfoResponse {
  has_onboarded: boolean;
}

export const useOnboarding = async (): Promise<OnboardingInfo> => {
  const cache = useDmsState<OnboardingInfo | null>(
    "dms-onboarding-info",
    () => null,
  );

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
  const cache = useDmsState<OnboardingInfo | null>(
    "dms-onboarding-info",
    () => null,
  );
  cache.value = { hasOnboarded: true };
};
