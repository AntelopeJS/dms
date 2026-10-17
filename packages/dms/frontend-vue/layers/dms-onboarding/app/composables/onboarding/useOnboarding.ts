import { effectScope } from "vue";

export interface OnboardingInfo {
  hasOnboarded: boolean;
}

interface OnboardingInfoResponse {
  has_onboarded: boolean;
}

const ONBOARDING_ENDPOINT = "/api/onboarding/informations";
// The key the server render hands its answer to the browser under.
const ONBOARDING_DATA_KEY = "dms-onboarding-info";

/**
 * The status once known, for the rest of the app's life. Kept apart from the
 * async data, which a change of account or workspace drops: the global
 * middleware reads it on every navigation and never asks twice.
 */
function useOnboardingCache() {
  return useDmsState<OnboardingInfo | null>("dms-onboarding-info", () => null);
}

/**
 * Reads the status as async data: a server render reads it inside an async
 * data handler and hands the answer to the browser with the page, whose first
 * call takes it over instead of asking again. The read runs in a scope of its
 * own, released once it answers, so nothing keeps showing the key and no
 * page refresh reads it again.
 */
async function readOnboardingInfo(): Promise<OnboardingInfo> {
  const scope = effectScope(true);
  const read = scope.run(() =>
    useApiData<OnboardingInfo>(
      ONBOARDING_DATA_KEY,
      async ({ $authFetch, signal }) => {
        const response = await $authFetch<OnboardingInfoResponse>(
          ONBOARDING_ENDPOINT,
          { method: "GET", signal },
        );
        return { hasOnboarded: response.has_onboarded };
      },
      { refreshOnPageRefresh: false },
    ),
  )!;
  try {
    await read;
  } finally {
    scope.stop();
  }
  if (read.error.value) throw read.error.value;
  // Cleared before it answered: a new session scope aborted the read.
  if (!read.data.value) throw new Error("The onboarding status was not read");
  return read.data.value;
}

export const useOnboarding = async (): Promise<OnboardingInfo> => {
  const cache = useOnboardingCache();

  const known = cache.value;
  if (known) return known;

  // One request per app however many callers ask before it answers: the
  // preload started with the app and the `onboarding` middleware share it.
  await useTrailingDeduper("onboarding").join(async () => {
    cache.value = await readOnboardingInfo();
  });
  return cache.value as OnboardingInfo;
};

/** Release the cached onboarding guard after the backend creates the admin. */
export const setOnboardingComplete = () => {
  useOnboardingCache().value = { hasOnboarded: true };
};
