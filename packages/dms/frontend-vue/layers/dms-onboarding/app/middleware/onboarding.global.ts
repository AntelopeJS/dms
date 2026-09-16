export default defineDmsMiddleware(async (to) => {
  // The onboarding wizard itself must always be reachable so it can render.
  if (to.path.startsWith("/onboarding")) return;

  // While the instance has no admin yet, funnel every route to the onboarding
  // wizard. Running as a global middleware (instead of a plugin) lets this take
  // precedence over the homepage redirect: otherwise an anonymous visitor is
  // sent to the configured homepage — a protected page whose 401 bounces them
  // to /auth, interrupting onboarding.
  let info;
  try {
    info = await useOnboarding();
  } catch {
    // If the onboarding status can't be resolved, don't block navigation.
    return;
  }

  if (info.hasOnboarded) return;

  return navigateDms("/onboarding");
});
