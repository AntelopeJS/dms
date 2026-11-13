import { isObject } from "../../../dms-core/app/utils/type-check";
interface AuthMiddlewareOptions {
  navigateAuthenticatedTo?: string;
  navigateUnauthenticatedTo?: string;
}

type MiddlewareMeta = boolean | AuthMiddlewareOptions;

function isAuthOptions(value: MiddlewareMeta): value is AuthMiddlewareOptions {
  return isObject(value) && value !== null;
}

/**
 * Loads the signed-in user's permission set before the page draws. A failed
 * load does not stop the navigation: the page draws without the set, so
 * every permission check answers no, and the failure is shown to the user.
 */
async function loadPermissionsIfNeeded() {
  const { loadPermissions } = usePermissions();
  const { presentError } = useApiErrorPresenter();

  try {
    await loadPermissions();
  } catch (error: unknown) {
    presentError(error, { fallbackKey: "error.500.description" });
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

  const options = to.meta.auth;
  if (!options) return;

  if (await isPublicAccessRoute(to)) return;

  const { loggedIn } = useDmsUserSession();

  if (loggedIn.value) {
    await loadPermissionsIfNeeded();
    return handleAuthenticatedUser(to, options);
  }

  return handleUnauthenticatedUser(to, options);
});
