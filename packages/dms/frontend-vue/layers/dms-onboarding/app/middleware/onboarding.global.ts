const ONBOARDING_PATH = "/onboarding";
const LOGIN_PATH = "/auth";

const BLOCK_PREVIEW_PATH = "/dms-preview";

function completedOnboardingDestination(): string {
  const { loggedIn } = useDmsUserSession();
  return loggedIn.value ? useHomepage() : LOGIN_PATH;
}

export default defineDmsMiddleware(async (to) => {
  if (to.path === BLOCK_PREVIEW_PATH) return;
  const isOnboardingRoute = to.path.startsWith(ONBOARDING_PATH);

  let info;
  try {
    info = await useOnboarding();
  } catch {
    return;
  }

  if (isOnboardingRoute) {
    if (!info.hasOnboarded) return;
    return navigateDms(completedOnboardingDestination(), { replace: true });
  }

  if (info.hasOnboarded) return;

  return navigateDms(ONBOARDING_PATH);
});
