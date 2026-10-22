export interface OnboardingInfo {
  hasOnboarded: boolean;
}

interface OnboardingInfoResponse {
  has_onboarded: boolean;
}

/**
 * The async data key of the onboarding status. The global middleware reads
 * it while a server renders a page, and the page hands it to the browser,
 * whose run of the middleware then finds it instead of asking again. It
 * holds nothing private.
 */
const ONBOARDING_KEY = "dms-onboarding";

export const useOnboarding = async (): Promise<OnboardingInfo> => {
  const known = useDmsData<OnboardingInfo>(ONBOARDING_KEY).data.value;
  if (known) return known;

  // One request per app however many callers ask before it answers: the
  // preload started with the app and the `onboarding` middleware share the
  // key. Its own triggers only: the status changes once, when the first
  // administrator registers (`setOnboardingComplete`).
  const status = await useApiData<OnboardingInfo>(
    ONBOARDING_KEY,
    async ({ $authFetch, signal }) => {
      const response = await $authFetch<OnboardingInfoResponse>(
        "/api/onboarding/informations",
        { method: "GET", signal },
      );
      return { hasOnboarded: response.has_onboarded };
    },
    { refreshOnPageRefresh: false },
  );
  // A failed read leaves the status unknown: the middleware lets the
  // navigation through, and the next one asks again.
  if (!status.data.value) throw status.error.value;
  return status.data.value;
};

/** Release the cached onboarding guard after the backend creates the admin. */
export const setOnboardingComplete = () => {
  useDmsData<OnboardingInfo>(ONBOARDING_KEY).data.value = {
    hasOnboarded: true,
  };
};
