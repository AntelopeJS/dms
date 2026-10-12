const MODULE_NOT_FOUND_KIND = "module-not-found";
const MODULE_NOT_FOUND_STATUS = 404;
const MODULE_NOT_FOUND_MESSAGE = "Module not found";
const MODULES_TREE_KEY = "modules";

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

function findModuleRootNode(
  tree: SiteLayoutTree | undefined,
  moduleId: string,
): SiteLayoutTree | null {
  if (!tree) return null;
  const modulesNode = tree.children[MODULES_TREE_KEY];
  if (!modulesNode) return null;
  for (const childId of modulesNode.childrenOrders) {
    const child = modulesNode.children[childId];
    if (!child) continue;
    if (child.isModuleRoot && child.id === moduleId) {
      return child;
    }
  }
  return null;
}

function isOpenablePage(node: SiteLayoutTree): boolean {
  return !!node.layoutUrl && node.hasAccess !== false;
}

/** The first page the caller may open under `node`, in menu order. */
function findPage(
  node: SiteLayoutTree,
  accepts: (page: SiteLayoutTree) => boolean,
): SiteLayoutTree | null {
  if (isOpenablePage(node) && accepts(node)) return node;
  for (const childId of node.childrenOrders) {
    const child = node.children[childId];
    if (!child || child.hasAccess === false) continue;
    const found = findPage(child, accepts);
    if (found) return found;
  }
  return null;
}

/**
 * The page a module opens on: its `landingPage` when the caller may open it,
 * else its first page in menu order.
 */
function resolveModuleLandingSlug(
  tree: SiteLayoutTree | undefined,
  moduleId: string,
  landingPage: string | undefined,
): string | null {
  const moduleRoot = findModuleRootNode(tree, moduleId);
  if (!moduleRoot) return null;
  const declared = landingPage
    ? findPage(moduleRoot, (page) => page.id === landingPage)
    : null;
  return (declared ?? findPage(moduleRoot, () => true))?.fullSlug ?? null;
}

/** `landing` with the query and hash of `fullPath`, as the module was entered. */
function withQueryAndHash(landing: string, fullPath: string): string {
  const start = fullPath.search(/[?#]/);
  return start < 0 ? landing : `${landing}${fullPath.slice(start)}`;
}

function ensureSiteLayoutLoaded(
  siteLayout: ReturnType<typeof useSiteLayout>,
): Promise<unknown> | undefined {
  if (siteLayout.siteLayout.value) return undefined;
  return siteLayout.loadSiteLayout();
}

export default defineDmsMiddleware(async (to) => {
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
    throw createError({
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
    return withQueryAndHash(landingSlug, to.fullPath);
  }

  return redirectToHomepage();
});
