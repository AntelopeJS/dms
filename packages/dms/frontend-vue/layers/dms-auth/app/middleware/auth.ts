interface AuthMiddlewareOptions {
  navigateAuthenticatedTo?: string;
  navigateUnauthenticatedTo?: string;
}

type MiddlewareMeta = boolean | AuthMiddlewareOptions;

function isAuthOptions(value: MiddlewareMeta): value is AuthMiddlewareOptions {
  return typeof value === "object" && value !== null;
}

async function loadPermissionsIfNeeded() {
  const { loadPermissions } = usePermissions();

  // prettier-ignore
  try {
    await loadPermissions();
  } catch {
    // eslint-disable-line no-empty -- Permission-load failures do not interrupt authentication.
  }
}

function handleAuthenticatedUser(
  to: ReturnType<typeof useDmsRoute>,
  options: MiddlewareMeta,
) {
  const authConfig = useDmsRuntimeConfig().public.dms;
  const { user } = useDmsUserSession();

  if (authConfig.mustValidateEmail && !user.value?.isValidated) {
    if (to.path === "/auth/validate") return;

    return navigateDms({
      path: "/auth/validate",
      query: { redirect: to.fullPath },
    });
  }

  if (isAuthOptions(options) && options.navigateAuthenticatedTo) {
    return navigateDms(options.navigateAuthenticatedTo);
  }
}

function handleUnauthenticatedUser(
  to: ReturnType<typeof useDmsRoute>,
  options: MiddlewareMeta,
) {
  if (isAuthOptions(options) && options.navigateUnauthenticatedTo) {
    return navigateDms(options.navigateUnauthenticatedTo);
  }

  if (to.path.startsWith("/auth")) return;

  return navigateDms({
    path: "/auth",
    query: { redirect: to.fullPath },
  });
}

async function isPublicAccessRoute(to: ReturnType<typeof useDmsRoute>) {
  const siteLayout = useSiteLayout();

  if (!siteLayout.siteLayout.value) {
    await siteLayout.loadSiteLayout();
  }

  const routeMatch = siteLayout.findMatchingRoute(to.path);
  return routeMatch?.metadata?.publicAccess === true;
}

export default defineDmsMiddleware(async (to) => {
  if (to.matched.length === 0) return;

  if (useDmsError().value) return abortDmsNavigation();

  const options = to.meta.auth as MiddlewareMeta | undefined;
  if (!options) return;

  if (await isPublicAccessRoute(to)) return;

  const { loggedIn } = useDmsUserSession();

  if (loggedIn.value) {
    await loadPermissionsIfNeeded();
    return handleAuthenticatedUser(to, options);
  }

  return handleUnauthenticatedUser(to, options);
});
