const ONBOARDING_PATH = "/onboarding";
const LOGIN_PATH = "/auth";

// Where a visit to the finished wizard lands: the app for a signed-in user, the
// login page for anyone else rather than a homepage whose 401 would bounce
// them there anyway.
function completedOnboardingDestination(): string {
  const { loggedIn } = useUserSession();
  return loggedIn.value ? useHomepage() : LOGIN_PATH;
}

export default defineDmsMiddleware(async (to) => {
  const isOnboardingRoute = to.path.startsWith(ONBOARDING_PATH);

  // While the instance has no admin yet, funnel every route to the onboarding
  // wizard. Running as a global middleware (instead of a plugin) lets this take
  // precedence over the homepage redirect: otherwise an anonymous visitor is
  // sent to the configured homepage — a protected page whose 401 bounces them
  // to /auth, interrupting onboarding.
  let info;
  try {
    info = await useOnboarding();
  } catch {
    // If the onboarding status can't be resolved, don't block navigation: the
    // wizard stays reachable, and it is its own register call that refuses a
    // second admin.
    return;
  }

  if (isOnboardingRoute) {
    if (!info.hasOnboarded) return;
    return navigateDms(completedOnboardingDestination(), { replace: true });
  }

  if (info.hasOnboarded) return;

  return navigateDms(ONBOARDING_PATH);
});
