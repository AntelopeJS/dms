import type { RequestContext } from "@antelopejs/interface-api";
import { pagesBySlug } from "../../../utils";
import {
  MODULE_URL_PREFIX,
  GetPageLayoutBySlug,
} from "@antelopejs/interface-dms/page";
import { assert } from "@antelopejs/interface-api-util";
import { withCategoryRefs, treeWithCategoryRefs } from "../menu-categories";
import {
  type LayoutBannerSerialized,
  resolveLayoutBanners,
} from "../layout-banners";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { LayoutBannerContext } from "@antelopejs/interface-dms/layout-banners";
import { TenantMemberModel, RoleModel } from "@antelopejs/interface-dms/db";
import type { ResolvedNavBadges } from "@antelopejs/interface-dms/page/internal/nav-badges";
import { resolveMenuNavBadges } from "../nav-badges";
import { getQuickActionsForUser } from "../quick-actions";
import { moduleRegistry, categoriesByFullId, navigationTree } from "./state";
import {
  resolveModuleLandingSlug,
  buildModuleAccessMap,
} from "./module-catalog";
import type {
  SharedPagePayloadArguments,
  PagePayload,
  PageResponsePayloadArguments,
  PageResponsePayload,
  NavigationEntry,
  RequestAccessContext,
  AccessFlag,
  SiteLayoutWithAccess,
  SiteLayoutPayload,
} from "./types";
import {
  buildAccessContext,
  computeEntryAccess,
  redactPresentation,
} from "./access";
import { resolveDynamicChildren, addAccessToTree } from "./dynamic-menu";
import { resolveQuickActionTarget } from "./quick-action-access";

export const PAGE_LAYOUT_SLUG_PARAMETER = "slug";

export const PAGE_REQUEST_PARAMETERS = ["path", "shared"];

/**
 * The query of the page URL a page request carries next to its own
 * parameters (`/dms/pagelayout`'s `slug`, `/dms/page`'s `path` and `shared`):
 * everything else, one value per name.
 */
export function pageQueryOf(
  requestContext: Pick<RequestContext, "url">,
  ownParameters: string[] = [PAGE_LAYOUT_SLUG_PARAMETER],
): Record<string, string> {
  const query = Object.fromEntries(requestContext.url.searchParams);
  for (const name of ownParameters) delete query[name];
  return query;
}

export function matchesPagePattern(pattern: string, path: string): boolean {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);
  return (
    patternSegments.length === pathSegments.length &&
    patternSegments.every(
      (segment, index) =>
        segment.startsWith(":") || segment === pathSegments[index],
    )
  );
}

/**
 * The route parameters `path` gives the page registered at `pattern`
 * (`/projects/project/p1` is `{ id: "p1" }` for `/projects/project/:id`),
 * empty when it does not match.
 */
export function pageParamsOf(
  pattern: string,
  path: string,
): Record<string, string> {
  if (!matchesPagePattern(pattern, path)) return {};
  const pathSegments = path.split("/").filter(Boolean);
  return Object.fromEntries(
    pattern
      .split("/")
      .filter(Boolean)
      .flatMap((segment, index) =>
        segment.startsWith(":")
          ? [[segment.slice(1), pathSegments[index]!]]
          : [],
      ),
  );
}

export function resolveRegisteredPageSlug(path: string): string | undefined {
  if (pagesBySlug[path]) return path;
  return Object.keys(pagesBySlug).find(
    (pattern) => pattern.includes(":") && matchesPagePattern(pattern, path),
  );
}

/**
 * The landing page a module's own address (`/modules/<id>`) stands for. The
 * address has no page of its own: answering its request with the landing page
 * lets the page render run the module routing middleware, which redirects the
 * visit there -- a server render with a redirect -- instead of failing it with
 * a 404 before the middleware runs.
 */
export function resolveModuleAddressSlug(path: string): string | undefined {
  const prefix = `${MODULE_URL_PREFIX}/`;
  if (!path.startsWith(prefix)) return undefined;
  const info = moduleRegistry[path.slice(prefix.length)];
  if (!info) return undefined;
  const landingSlug = resolveModuleLandingSlug(info);
  return landingSlug === path ? undefined : landingSlug;
}

export function resolveServedPageSlug(path: string): string | undefined {
  return resolveRegisteredPageSlug(path) ?? resolveModuleAddressSlug(path);
}

export function buildPagePayload(
  ...arguments_: SharedPagePayloadArguments
): Promise<PagePayload>;

export function buildPagePayload(
  ...arguments_: PageResponsePayloadArguments
): Promise<PageResponsePayload>;

export async function buildPagePayload(
  ...arguments_: SharedPagePayloadArguments | PageResponsePayloadArguments
): Promise<PageResponsePayload> {
  const [
    slug,
    user,
    memberModel,
    roleModel,
    tenantId,
    includeShared = true,
    requestContext,
  ] = arguments_;
  const normalizedSlug = `/${slug.replace(/^\/+|\/+$/g, "")}`;
  const registeredSlug = resolveServedPageSlug(normalizedSlug);
  assert(registeredSlug, 404, "error.page_not_found");
  const handler = GetPageLayoutBySlug(registeredSlug);
  assert(handler, 404, "error.page_not_found");
  const route = pagesBySlug[registeredSlug];
  assert(route, 404, "error.page_not_found");
  const context = await buildAccessContext(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  const [layout, navBadges] = await Promise.all([
    handler({
      user,
      memberModel,
      roleModel,
      tenantId,
      query:
        requestContext && pageQueryOf(requestContext, PAGE_REQUEST_PARAMETERS),
      params: pageParamsOf(registeredSlug, normalizedSlug),
    }),
    resolvePageNavBadges(user, context, requestContext),
  ]);
  if (!includeShared) {
    const routes = withCategoryRefs(
      await annotateRegistryAccess({ [registeredSlug]: route }, context),
    );
    return { route: routes[registeredSlug], layout, navBadges };
  }
  const shared = await buildSiteLayoutFor(user, tenantId, context);
  return {
    route: shared.siteLayout.pages[registeredSlug],
    shared,
    layout,
    navBadges,
  };
}

export async function annotateRegistryAccess<T extends NavigationEntry>(
  registry: Record<string, T>,
  context: RequestAccessContext,
): Promise<Record<string, T & AccessFlag>> {
  const annotated: Record<string, T & AccessFlag> = {};
  for (const [slug, info] of Object.entries(registry)) {
    const hasAccess = await computeEntryAccess(info, context);
    annotated[slug] = hasAccess
      ? { ...info, hasAccess }
      : { ...redactPresentation(info), hasAccess };
  }
  return annotated;
}

export async function annotateSiteLayoutAccess(
  context: RequestAccessContext,
  banners: Promise<LayoutBannerSerialized[]>,
): Promise<SiteLayoutWithAccess> {
  return {
    pages: withCategoryRefs(await annotateRegistryAccess(pagesBySlug, context)),
    categories: withCategoryRefs(
      await annotateRegistryAccess(categoriesByFullId, context),
    ),
    banners: await banners,
  };
}

export function buildLayoutBannerContext(
  user: User | undefined,
  tenantId: string,
  context: RequestAccessContext,
): LayoutBannerContext {
  return {
    user,
    tenantId,
    permissions: new Set(context.ungated.permissions),
    isOwner: context.ungated.isOwner,
    isTenantAccessDenied: context.gateDenied,
  };
}

/**
 * The site layout of a caller: the menu, with each entry's access, the quick
 * actions and the modules. A browser keeps it for minutes (an Inertia once
 * prop), so it holds nothing that moves between visits: the counted
 * navigation badges travel with each page instead (`navBadges`).
 */
export async function buildSiteLayoutPayload(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<SiteLayoutPayload> {
  const accessContext = await buildAccessContext(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return buildSiteLayoutFor(user, tenantId, accessContext);
}

/**
 * The counted navigation badges of the pages `user` can open, by page full
 * id; none for a page that declares a static `badge`, which the menu keeps.
 */
export async function resolvePageNavBadges(
  user: User | undefined,
  context: RequestAccessContext,
  requestContext: RequestContext | undefined,
): Promise<ResolvedNavBadges> {
  if (!user || !requestContext) return {};
  const entries = await Promise.all(
    Object.values(pagesBySlug)
      .filter((page) => page.badge === undefined)
      .map(async (page) => ({
        fullId: page.fullId,
        hasAccess: await computeEntryAccess(page, context),
      })),
  );
  return resolveMenuNavBadges(requestContext, user, entries);
}

/**
 * {@link resolvePageNavBadges} for a caller: what a page visit carries next
 * to its layout.
 */
export async function buildNavBadges(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
  requestContext: RequestContext | undefined,
): Promise<ResolvedNavBadges> {
  const context = await buildAccessContext(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return resolvePageNavBadges(user, context, requestContext);
}

export async function buildSiteLayoutFor(
  user: User | undefined,
  tenantId: string,
  accessContext: RequestAccessContext,
): Promise<SiteLayoutPayload> {
  const banners = resolveLayoutBanners(
    buildLayoutBannerContext(user, tenantId, accessContext),
  );
  const dynamicChildren = await resolveDynamicChildren(
    user,
    tenantId,
    accessContext,
  );

  return {
    siteLayout: await annotateSiteLayoutAccess(accessContext, banners),
    siteLayoutTree: treeWithCategoryRefs(
      await addAccessToTree(
        navigationTree,
        accessContext,
        true,
        dynamicChildren,
      ),
    ),
    quickActions: await getQuickActionsForUser((target) =>
      resolveQuickActionTarget(target, accessContext),
    ),
    modules: await buildModuleAccessMap(accessContext),
    isOwner: accessContext.gated.isOwner,
  };
}
