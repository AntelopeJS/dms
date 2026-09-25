interface AuthMiddlewareOptions {
  navigateAuthenticatedTo?: string;
  navigateUnauthenticatedTo?: string;
}

type MiddlewareMeta = boolean | AuthMiddlewareOptions;

function isAuthOptions(value: MiddlewareMeta): value is AuthMiddlewareOptions {
  return typeof value === "object" && value !== null;
}

async function loadPermissionsIfNeeded() {
  const { isLoaded, fetchPermissions } = usePermissions();

  if (isLoaded.value) return;

  try {
    await fetchPermissions();
  } catch {
    /* ignore — permissions load failure is not fatal here */
  }
}

function handleAuthenticatedUser(
  to: ReturnType<typeof useDmsRoute>,
  options: MiddlewareMeta,
) {
  const authConfig = useDmsRuntimeConfig().public.dms;
  const { user } = useUserSession();

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

  // An error the page already raised (a failed `validation`, a missing page)
  // is committed and rendered with its own status. Re-throwing it here would
  // reject the pending navigation the SSR render awaits, turning that 404 into
  // a 500 fallback render.
  if (useError().value) return abortNavigation();

  const options = to.meta.auth as MiddlewareMeta | undefined;
  if (!options) return;

  if (await isPublicAccessRoute(to)) return;

  const { loggedIn } = useUserSession();

  if (loggedIn.value) {
    await loadPermissionsIfNeeded();
    return handleAuthenticatedUser(to, options);
  }

  return handleUnauthenticatedUser(to, options);
});
