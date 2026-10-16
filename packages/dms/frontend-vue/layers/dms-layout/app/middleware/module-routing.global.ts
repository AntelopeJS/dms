import { resolveModuleLandingSlug } from "../utils/moduleLanding";

const MODULE_NOT_FOUND_KIND = "module-not-found";
const MODULE_NOT_FOUND_STATUS = 404;
const MODULE_NOT_FOUND_MESSAGE = "Module not found";

interface GuardedRoute {
  path: string;
}

interface ModuleRouteParts {
  moduleId: string;
  slug: string;
}

function parseModuleRoute(path: string): ModuleRouteParts | null {
  const prefix = `${MODULE_URL_PREFIX}/`;
  if (!path.startsWith(prefix)) return null;

  const remainder = path.slice(prefix.length);
  if (remainder.length === 0) return null;

  const slashIndex = remainder.indexOf("/");
  if (slashIndex === -1) {
    return { moduleId: remainder, slug: "" };
  }

  return {
    moduleId: remainder.slice(0, slashIndex),
    slug: remainder.slice(slashIndex + 1),
  };
}

/** `landing` with the query and hash of `fullPath`, as the module was entered. */
function withQueryAndHash(landing: string, fullPath: string): string {
  const start = fullPath.search(/[?#]/);
  return start < 0 ? landing : `${landing}${fullPath.slice(start)}`;
}

/**
 * Whether the browser already draws the page at `to`: a link that visits the
 * module's address without a navigation guard gets the landing page served
 * there, and the guard then runs from that page's own setup (`to` is the page
 * on screen). A navigation started from there restarts with each remount of
 * the page it starts, so the browser loads the landing page instead.
 */
function isDrawnInBrowser(
  to: GuardedRoute,
  from: GuardedRoute | undefined,
): boolean {
  return typeof window !== "undefined" && from?.path === to.path;
}

function ensureSiteLayoutLoaded(
  siteLayout: ReturnType<typeof useSiteLayout>,
): Promise<unknown> | undefined {
  if (siteLayout.siteLayout.value) return undefined;
  return siteLayout.loadSiteLayout();
}

export default defineDmsMiddleware(async (to, from) => {
  const moduleRoute = parseModuleRoute(to.path);
  if (!moduleRoute) return;

  const { moduleId, slug } = moduleRoute;

  const siteLayout = useSiteLayout();
  const pendingLoad = ensureSiteLayoutLoaded(siteLayout);
  if (pendingLoad) await pendingLoad;

  // Redirect to the configured homepage, but never in a way that re-enters this
  // guard and loops: not to the path we're already on, and not to a homepage
  // that is itself an unresolved module route. Either makes Vue Router abort
  // with "Infinite redirect in navigation guard" — most visibly mid dev
  // hot-reload, when the re-registering module's route is briefly absent from
  // the site layout before it is re-committed (see
  // useSiteLayout.probeAndCommitRoute), or simply when a project pins its
  // homepage to one of its own `/modules/*` pages. Falling through lets the page
  // render its own 404 (or the dev-reload plugin re-commit the layout) instead.
  const redirectToHomepage = () => {
    const homepage = useHomepage();
    if (homepage === to.path) return undefined;
    if (parseModuleRoute(homepage) && !siteLayout.findMatchingRoute(homepage)) {
      return undefined;
    }
    return navigateDms(homepage, { replace: true });
  };

  const moduleEntry = siteLayout.modules.value?.[moduleId];

  if (!moduleId || !moduleEntry) {
    throw createDmsError({
      statusCode: MODULE_NOT_FOUND_STATUS,
      statusMessage: MODULE_NOT_FOUND_MESSAGE,
      data: { kind: MODULE_NOT_FOUND_KIND },
    });
  }

  if (moduleEntry.hasAccess === false) {
    return redirectToHomepage();
  }

  const matchedRoute = siteLayout.findMatchingRoute(to.path);
  if (matchedRoute?.metadata) {
    if (slug) {
      useModuleHistory().record(moduleId, to.path);
    }
    return;
  }

  const landingSlug = resolveModuleLandingSlug(
    siteLayout.siteLayoutTree.value,
    moduleId,
    moduleEntry.landingPage,
  );

  // Answered rather than navigated to: the navigation that entered the
  // module goes to the landing page instead, so the module's own address
  // never renders (a 404 before the redirect landed), never enters the
  // history, and a server render answers it with a redirect.
  if (landingSlug && landingSlug !== to.path) {
    const landing = withQueryAndHash(landingSlug, to.fullPath);
    if (isDrawnInBrowser(to, from)) {
      window.location.replace(landing);
      return false;
    }
    return landing;
  }

  return redirectToHomepage();
});
