import type { PassThrough } from "node:stream";
import {
  Context,
  Controller,
  Get,
  Parameter,
  type RequestContext,
  WriteStream,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { Action, type Component } from "@antelopejs/interface-dms/component";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  type CategoryInfo,
  ClearPageLayoutBySlug,
  type DynamicMenuItem,
  type DynamicMenuProviderInfo,
  GetPageLayoutBySlug,
  isInsideModule,
  MODULE_URL_PREFIX,
  type ModuleInfo,
  type PageExtensionInfo,
  type PageInfo,
  type PageLayout,
  PageMetadata,
  internal as pageInterfaceInternal,
} from "@antelopejs/interface-dms/page";
import {
  GetEffectiveUserPermissions,
  HasPermission,
  UnmarkModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";
import type { QuickActionTarget } from "@antelopejs/interface-dms/quick-actions";
import { internal as realtimeInternal } from "@antelopejs/interface-dms/realtime";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  CheckTenantAccess,
  gateAllowsSurface,
} from "@antelopejs/interface-dms/tenant-access";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  componentTargetClientId,
  resolveComponentTarget,
} from "@antelopejs/interface-dms/page/component-target";
import {
  buildMenuTopic,
  getRealtimeBroker,
  MENU_BROADCAST_TOPIC,
  MENU_CHANGED_EVENT_TYPE,
} from "../../realtime";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { scheduleBroadcast, setSlugProvider } from "./dev-reload";
import {
  buildFrontendManifest,
  writeFrontendModules,
} from "./frontend-modules";
import { BOOTSTRAP_HEADER } from "./frontend-bootstrap";
import type { FrontendManifest, ManifestModuleEntry } from "./manifest";
import {
  getQuickActionsForUser,
  type QuickActionsPayload,
  type QuickActionTargetSerialized,
} from "./quick-actions";
import { fillRouteParams } from "./route-params";
import { warnOnceFor } from "./warn-once";

export {
  AddFrontendModule,
  createIgnoreFilter,
  GetFrontendModules,
} from "./frontend-modules";

type SiteLayoutTree = Omit<PageInfo, "layoutUrl"> & {
  children: Record<string, SiteLayoutTree>;
  childrenOrders: string[];
  layoutUrl?: string;
  hasAccess?: boolean;
};
// `SiteLayoutWithAccess` is the serialized shape the browser resolves a URL
// against, so both of its maps are keyed by slug. These registries are not that
// shape: pages own their slug, but any number of `urlTransparent` categories
// share their parent's, so only `fullId` identifies a category. The names carry
// the key to keep the two from being confused again.
const pagesBySlug: Record<string, PageInfo> = {};
const categoriesByFullId: Record<string, CategoryInfo> = {};
const navigationTree: SiteLayoutTree = {
  displayName: "",
  children: {},
  childrenOrders: [],
  id: "",
  fullId: "",
  fullSlug: "",
  category: undefined,
};
const OMIT_SHARED_PAGE_QUERY_VALUE = "false";

setSlugProvider(() => Object.keys(pagesBySlug));

function resolvePagePermissionId(
  permission: PageInfo["permission"],
  fullId: string,
): string {
  if (permission instanceof Action) {
    return permission.permissionId ?? fullId;
  }
  return permission?.id || fullId;
}

// The serialized layout is keyed by slug — the browser resolves a URL against
// it — so two surfaces reachable at one slug silently replace each other. Say
// so: it is always a declaration error, and the symptom otherwise is a page
// that simply is not the one you wrote. `urlTransparent` categories are exempt
// and never reach this: sharing the parent's slug is what they are for.
function warnOnSlugCollision<T extends { fullSlug: string; fullId: string }>(
  existing: T | undefined,
  incoming: T,
): void {
  if (!existing || existing.fullId === incoming.fullId) return;
  warnOnceFor(
    incoming,
    "slug-collision",
    `[dms] "${incoming.fullId}" claims the slug "${incoming.fullSlug}", already served by "${existing.fullId}": the later registration wins.`,
  );
}

function findNavigableCategoryBySlug(slug: string): CategoryInfo | undefined {
  return Object.values(categoriesByFullId).find(
    (category) => !category.urlTransparent && category.fullSlug === slug,
  );
}

// The slug view of the category registry, as the client resolves URLs against
// it. `urlTransparent` categories are left out: they answer at their parent's
// slug, so including them would shadow whichever surface actually owns it —
// with the winner decided by module registration order.
function buildNavigableCategoryIndex(): Record<string, CategoryInfo> {
  const bySlug: Record<string, CategoryInfo> = {};
  for (const category of Object.values(categoriesByFullId)) {
    if (category.urlTransparent) continue;
    bySlug[category.fullSlug] = category;
  }
  return bySlug;
}

function findEntryByFullId<T extends { fullId: string }>(
  registry: Record<string, T>,
  fullId: string,
): T | undefined {
  return Object.values(registry).find((entry) => entry.fullId === fullId);
}

function findPageByFullId(fullId: string): PageInfo | undefined {
  return findEntryByFullId(pagesBySlug, fullId);
}

function findNavigationEntryByFullId(
  fullId: string,
): PageInfo | CategoryInfo | undefined {
  return categoriesByFullId[fullId] ?? findPageByFullId(fullId);
}

export async function userCanAccessPage(
  user: User | undefined,
  fullId: string,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<boolean> {
  const info = findPageByFullId(fullId);
  if (!info) return false;
  // Same semantics as computeEntryAccess: module pages are owner-only, even
  // when publicAccess is set or a stored role grants the page permission.
  if (!user) return !isInsideModule(info) && info.publicAccess === true;
  const access = await CheckTenantAccess(user._id, tenantId);
  // Same rule as the menu and `/dms/pagelayout`, from the same function: a
  // denied tenant keeps the surfaces that opted out, plus the public and
  // auth-only screens it needs to recover — realtime on them included.
  if (!gateAllowsSurface(info, !access.allowed)) return false;
  const roleIds = await getRoleIdsForUser(memberModel, user);
  const permissions = await GetEffectiveUserPermissions(
    user,
    tenantId,
    roleIds,
    roleModel,
  );
  if (permissions.has(WILDCARD_PERMISSION)) return true;
  if (isInsideModule(info)) return false;
  if (info.authOnly) return true;
  return HasPermission(
    permissions,
    resolvePagePermissionId(info.permission, info.fullId),
  );
}

function addToTree(newPageInfo: PageInfo | CategoryInfo) {
  const parts = newPageInfo.fullId.split(".");
  let currentLevel = navigationTree.children;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!currentLevel[part]) {
      currentLevel[part] = {
        displayName: "none",
        children: {},
        childrenOrders: [],
        id: "",
        fullId: "",
        fullSlug: "",
        category: undefined,
      };
    }
    currentLevel = currentLevel[part].children;
  }

  const lastPart = parts[parts.length - 1];
  const existingChildren = currentLevel[lastPart]?.children || {};
  const existingChildrenOrders = currentLevel[lastPart]?.childrenOrders || [];
  currentLevel[lastPart] = {
    ...newPageInfo,
    children: existingChildren,
    childrenOrders: existingChildrenOrders,
  };

  updateChildrenOrders(navigationTree);
}

// Codepoint-wise, never locale-aware: the same set of entries must assemble
// the same menu on every host.
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// `order` first, then what the reader actually sees, then the id — unique
// among siblings, so the order is total. Without the last two, entries sharing
// an `order` fell back to insertion order, which is the order the modules
// happened to start in: a menu that rearranges itself between two restarts.
function compareMenuChildren(a: SiteLayoutTree, b: SiteLayoutTree): number {
  return (
    (a.order ?? 0) - (b.order ?? 0) ||
    compareText(a.displayName, b.displayName) ||
    compareText(a.id, b.id)
  );
}

function sortChildIdsByOrder(
  children: Record<string, SiteLayoutTree>,
): string[] {
  return Object.keys(children).sort((a, b) =>
    compareMenuChildren(children[a], children[b]),
  );
}

function updateChildrenOrders(node: SiteLayoutTree) {
  node.childrenOrders = sortChildIdsByOrder(node.children);
  for (const child of node.childrenOrders) {
    updateChildrenOrders(node.children[child]);
  }
}

// Deleting the node outright would take its whole subtree with it: a category
// unregistering dropped every page other modules had registered under it from
// the sidebar, while those pages stayed in the registry and kept serving. Drop
// what this entry owns, and let the node go only once nothing lives under it.
function removeFromTree(fullId: string) {
  const parts = fullId.split(".");
  const levels: Array<Record<string, SiteLayoutTree>> = [
    navigationTree.children,
  ];
  let currentLevel = navigationTree.children;

  for (let i = 0; i < parts.length - 1; i++) {
    const node = currentLevel[parts[i]];
    if (!node) return;
    currentLevel = node.children;
    levels.push(currentLevel);
  }

  const target = currentLevel[parts[parts.length - 1]];
  if (!target) return;
  if (Object.keys(target.children).length > 0) {
    // Still holds registered descendants: blank the entry so nothing shows it,
    // and keep it as the container they hang from.
    currentLevel[parts[parts.length - 1]] = {
      ...target,
      displayName: "none",
      id: "",
      fullId: "",
      fullSlug: "",
      category: undefined,
    };
    updateChildrenOrders(navigationTree);
    return;
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const level = levels[i];
    const node = level[parts[i]];
    if (!node) return;
    if (
      i < parts.length - 1 &&
      (node.fullId || Object.keys(node.children).length > 0)
    ) {
      break;
    }
    delete level[parts[i]];
  }
  updateChildrenOrders(navigationTree);
}

const moduleRegistry: Record<string, ModuleInfo> = {};
const dynamicMenuProviders: DynamicMenuProviderInfo[] = [];
// Which provider produced a dynamic node. The nodes are per-request copies, so
// the entries die with the request; it exists only to name, at merge time, the
// provider whose entry was dropped — the one that has to hear about it.
const nodeProviders = new WeakMap<object, DynamicMenuProviderInfo>();

const HTTP_FORBIDDEN = 403;
const WILDCARD_PERMISSION = "*";
const ERROR_UNAUTHORIZED = "error.unauthorized";

/**
 * A change to the navigation structure itself — a page, category or module
 * appearing or going away.
 *
 * The dev resync additionally re-probes routes after a hot reload, so it stays
 * on its own channel; the realtime publish is what reaches production, where a
 * module unloaded at runtime would otherwise sit in every connected menu until
 * the five-minute staleness refresh.
 *
 * Only called for changes a menu can show. Hidden surfaces never enter the
 * navigation tree — the forms a TableView generates are hidden, and every one
 * of them would otherwise wake every session of the deployment for a menu that
 * cannot change.
 */
function notifyStructureChanged(): void {
  scheduleBroadcast();
  schedulePublishMenuChanged(undefined);
}

/**
 * Implements the {@link NotifyMenuChanged} interface function: invalidates the
 * menu on both channels, the realtime stream that reaches connected clients in
 * production and the dev resync broadcast that additionally re-probes routes
 * after a hot reload.
 */
export function NotifyMenuChanged(tenantId?: string): void {
  scheduleBroadcast();
  schedulePublishMenuChanged(tenantId);
}

const MODULE_CONTEXT_GONE = "ERR_MODULE_CONTEXT_INVALIDATED";

function isModuleContextGone(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === MODULE_CONTEXT_GONE
  );
}

function ignoreModuleContextGone(error: unknown): void {
  if (!isModuleContextGone(error)) throw error;
}

const MENU_NOTIFICATION_WINDOW_MS = 250;
const lastMenuPublishAt = new Map<string, number>();
const pendingMenuNotifications = new Map<string, NodeJS.Timeout>();

// Each event makes every reached client refetch its whole site layout, which
// re-runs every dynamic menu resolver server-side — so a caller looping over
// rows (a bulk import notifying per project) multiplies that by the number of
// connected sessions. Publishing leads the window and the rest of a burst
// collapses into one trailing publish: an isolated change still reaches
// clients immediately, which is the point of the signal, while a burst costs
// two rounds instead of N. Targets are independent — one tenant's burst never
// delays another's.
function schedulePublishMenuChanged(tenantId: string | undefined): void {
  const target = tenantId ?? MENU_BROADCAST_TOPIC;
  // The module can be taken down between scheduling and firing -- the last page
  // to unregister schedules one on its way out. Both calls below reach an
  // interface bound to the module context, and they fail differently once that
  // context is gone: `fireAndForget` is a proxied function, so entering it
  // throws right here, while the realtime publish inside `publishMenuChanged`
  // fails within an async function and surfaces as a rejection. Neither is a
  // failure worth reporting, and an uncaught one from a timer callback would
  // take the process with it -- so both paths are filtered.
  const publish = (): void => {
    lastMenuPublishAt.set(target, Date.now());
    try {
      fireAndForget(
        publishMenuChanged(tenantId).catch(ignoreModuleContextGone),
        "menu change notification",
      );
    } catch (error) {
      ignoreModuleContextGone(error);
    }
  };

  const sinceLast = Date.now() - (lastMenuPublishAt.get(target) ?? 0);
  if (sinceLast >= MENU_NOTIFICATION_WINDOW_MS) {
    publish();
    return;
  }
  if (pendingMenuNotifications.has(target)) return;
  const timer = setTimeout(() => {
    pendingMenuNotifications.delete(target);
    publish();
  }, MENU_NOTIFICATION_WINDOW_MS - sinceLast);
  timer.unref?.();
  pendingMenuNotifications.set(target, timer);
}

/**
 * A trailing publish left behind by the last change would fire against a torn
 * down module: the interface calls it makes are bound to the module context,
 * and reaching them once that context is gone throws out of a timer callback,
 * where nothing can catch it.
 */
export function cancelPendingMenuNotifications(): void {
  for (const timer of pendingMenuNotifications.values()) {
    clearTimeout(timer);
  }
  pendingMenuNotifications.clear();
}

async function publishMenuChanged(tenantId: string | undefined): Promise<void> {
  await getRealtimeBroker().publish({
    topic: tenantId ? buildMenuTopic(tenantId) : MENU_BROADCAST_TOPIC,
    type: MENU_CHANGED_EVENT_TYPE,
    ts: Date.now(),
  });
}

export namespace internal {
  // Both `register` and `unregister` schedule the dev resync broadcast. The
  // 250ms debounce coalesces a hot reload's unregister burst + register burst
  // into a single broadcast that lands once re-registration has settled.
  // Broadcasting on unregister too is what lets a pure removal (deleting a
  // module's only page, or removing a module) reach clients even when no
  // trailing register() follows. A broadcast that fires mid-burst, while the
  // user's route is momentarily unregistered, is harmless: the client commits
  // via probeAndCommitRoute, which only commits once the route is present and
  // otherwise keeps polling — so it never commits a layout missing the route.
  export const RegisterCategory = {
    register: (categoryInfo: CategoryInfo) => {
      if (!categoryInfo.urlTransparent) {
        warnOnSlugCollision(
          findNavigableCategoryBySlug(categoryInfo.fullSlug),
          categoryInfo,
        );
      }
      categoriesByFullId[categoryInfo.fullId] = categoryInfo;

      if (!categoryInfo.hidden) {
        addToTree(categoryInfo);
        notifyStructureChanged();
      }
    },
    unregister: (categoryInfo: CategoryInfo) => {
      if (categoriesByFullId[categoryInfo.fullId] !== categoryInfo) {
        return;
      }
      delete categoriesByFullId[categoryInfo.fullId];
      if (!categoryInfo.hidden) {
        removeFromTree(categoryInfo.fullId);
        notifyStructureChanged();
      }
      // Keep the module-scoped deny set symmetric with the registration
      // lifecycle so a hot-reload that moves an entry out of a module does
      // not keep denying its permission until restart.
      if (isInsideModule(categoryInfo)) {
        UnmarkModuleScopedPermission(
          resolvePagePermissionId(categoryInfo.permission, categoryInfo.fullId),
        );
      }
    },
  };

  export const RegisterPage = {
    register: (pageInfo: PageInfo) => {
      warnOnSlugCollision(pagesBySlug[pageInfo.fullSlug], pageInfo);
      pagesBySlug[pageInfo.fullSlug] = pageInfo;

      if (!pageInfo.hidden) {
        addToTree(pageInfo);
        notifyStructureChanged();
      }
    },
    unregister: (pageInfo: PageInfo) => {
      // Two surfaces can claim one slug: the later registration won the
      // registry, and letting the earlier one delete on its way out would take
      // the live entry with it.
      if (pagesBySlug[pageInfo.fullSlug] !== pageInfo) {
        pageInterfaceInternal.clearPageMetadata(pageInfo.fullId, pageInfo);
        return;
      }
      delete pagesBySlug[pageInfo.fullSlug];
      if (!pageInfo.hidden) {
        removeFromTree(pageInfo.fullId);
        notifyStructureChanged();
      }
      if (isInsideModule(pageInfo)) {
        UnmarkModuleScopedPermission(
          resolvePagePermissionId(pageInfo.permission, pageInfo.fullId),
        );
      }
      // Drop the page's metadata too, so an extension registered afterwards is
      // held for the page's next registration instead of grafting itself onto
      // a page that no longer serves.
      pageInterfaceInternal.clearPageMetadata(pageInfo.fullId, pageInfo);
      // …and its layout handler, which `/dms/pagelayout` resolves by slug and
      // would otherwise keep serving the page after its module is gone.
      ClearPageLayoutBySlug(pageInfo.fullSlug);
      // …and the realtime topics registered against it: they are the allowlist
      // the SSE routes check subscriptions against.
      realtimeInternal.RegisterPageTopic.unregister(pageInfo.fullId);
    },
  };

  export const RegisterModule = {
    register: (info: ModuleInfo) => {
      moduleRegistry[info.id] = info;
      notifyStructureChanged();
    },
    unregister: (info: ModuleInfo) => {
      delete moduleRegistry[info.id];
      pageInterfaceInternal.clearModuleResolution(info.id);
      notifyStructureChanged();
    },
  };

  export const RegisterDynamicMenuProvider = {
    register: (info: DynamicMenuProviderInfo) => {
      dynamicMenuProviders.push(info);
      notifyStructureChanged();
    },
    unregister: (info: DynamicMenuProviderInfo) => {
      const index = dynamicMenuProviders.indexOf(info);
      if (index >= 0) dynamicMenuProviders.splice(index, 1);
      notifyStructureChanged();
    },
  };

  // Routing page extensions through the proxy is what binds them to the
  // extending module's lifetime: the core unregisters every entry a module
  // registered when that module stops, so its blocks leave the target page.
  export const RegisterPageExtension = {
    register: (info: PageExtensionInfo) => {
      pageInterfaceInternal.applyPageExtension(info);
      scheduleBroadcast();
    },
    unregister: (info: PageExtensionInfo) => {
      pageInterfaceInternal.revokePageExtension(info);
      scheduleBroadcast();
    },
  };
}

export class DMSController extends Controller("/dms") {
  @Parameter(BOOTSTRAP_HEADER, "header")
  declare bootstrapHeader: string | undefined;

  @Parameter("path", "query")
  declare pagePath: string;

  @Parameter("shared", "query")
  declare sharedPage: string | undefined;

  @Get("/frontend")
  async frontend(
    @Context() requestContext: RequestContext,
    @Parameter("clientUrl", "query") clientUrl: string | undefined,
    @Parameter("renderer", "query") renderer: string | undefined,
    @Parameter("rendererVersion", "query") rendererVersion: string | undefined,
  ): Promise<FrontendManifest<ManifestModuleEntry>> {
    return buildFrontendManifest(
      requestContext,
      clientUrl,
      renderer,
      rendererVersion,
      this.bootstrapHeader,
    );
  }

  @Get("/frontend/modules")
  async frontendModules(
    @WriteStream("application/zip") out: PassThrough,
    @Parameter("renderer", "query") renderer: string | undefined,
    @Parameter("rendererVersion", "query") rendererVersion: string | undefined,
  ) {
    await writeFrontendModules(
      out,
      renderer,
      rendererVersion,
      this.bootstrapHeader,
    );
  }

  @Get("/permissions")
  async userPermissions(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<string[]> {
    return resolveUserPermissions(
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
    );
  }

  @Get("/sitelayout")
  async siteLayout(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<SiteLayoutPayload> {
    return buildSiteLayoutPayload(
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
    );
  }

  @Get("/modules-listing")
  async modulesListing(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<Array<ModuleInfo & { hasAccess: boolean; landingSlug: string }>> {
    const accessContext = await buildAccessContext(
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
    );
    assert(accessContext.gated.isOwner, HTTP_FORBIDDEN, ERROR_UNAUTHORIZED);

    return Object.values(moduleRegistry).map((info) => ({
      ...info,
      hasAccess: true,
      landingSlug: resolveModuleLandingSlug(info),
    }));
  }

  @Get("/pagelayout")
  async pageLayout(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
    @Parameter("slug", "query") slug: string,
  ) {
    assert(slug, 400, "error.slug_required");

    const normalizedSlug = slug.startsWith("/") ? slug : `/${slug}`;
    const handler = GetPageLayoutBySlug(normalizedSlug);
    assert(handler, 404, "error.page_not_found");

    return handler(
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
    );
  }

  @Get("/page")
  async page(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<PageResponsePayload> {
    assert(this.pagePath, 400, "error.path_required");
    return buildPagePayload(
      this.pagePath,
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
      this.sharedPage !== OMIT_SHARED_PAGE_QUERY_VALUE,
    );
  }
}

interface AccessContext {
  permissions: Set<string>;
  isOwner: boolean;
  isAuthenticated: boolean;
}

/**
 * The three readings of the same request. `gated` is what every product surface
 * sees — empty when a tenant access gate denies the tenant; `ungated` ignores
 * the gate and serves the surfaces flagged `bypassTenantAccessGate`; `client` is
 * exactly what `/dms/permissions` hands over, which is what the browser can act
 * on. All three are the same object when no gate denies, and `gateDenied`
 * records that a gate refused — access checks must then drop the
 * `defaultGranted` fallback, or surfaces granted that way would render as
 * entries whose every route still asserts the gate and 403s.
 */
interface RequestAccessContext {
  gated: AccessContext;
  ungated: AccessContext;
  client: AccessContext;
  gateDenied: boolean;
  entryAccess: Map<string, Promise<boolean>>;
}

interface AccessFlag {
  hasAccess: boolean;
}

interface SiteLayoutWithAccess {
  pages: Record<string, PageInfo & AccessFlag>;
  categories: Record<string, CategoryInfo & AccessFlag>;
}

export interface SiteLayoutPayload {
  siteLayout: SiteLayoutWithAccess;
  siteLayoutTree: SiteLayoutTree;
  quickActions: QuickActionsPayload;
  modules: Record<string, ModuleInfo & AccessFlag>;
  isOwner: boolean;
}

export interface PagePayload {
  route: PageInfo & AccessFlag;
  shared: SiteLayoutPayload;
  layout: PageLayout;
}

export interface PageResponsePayload extends Omit<PagePayload, "shared"> {
  shared?: SiteLayoutPayload;
}

function matchesPagePattern(pattern: string, path: string): boolean {
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

function resolveRegisteredPageSlug(path: string): string | undefined {
  if (pagesBySlug[path]) return path;
  return Object.keys(pagesBySlug).find(
    (pattern) => pattern.includes(":") && matchesPagePattern(pattern, path),
  );
}

type SharedPagePayloadArguments = [
  slug: string,
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
];

type PageResponsePayloadArguments = [
  ...SharedPagePayloadArguments,
  includeShared: boolean,
];

export function buildPagePayload(
  ...arguments_: SharedPagePayloadArguments
): Promise<PagePayload>;
export function buildPagePayload(
  ...arguments_: PageResponsePayloadArguments
): Promise<PageResponsePayload>;
export async function buildPagePayload(
  ...arguments_: SharedPagePayloadArguments | PageResponsePayloadArguments
): Promise<PageResponsePayload> {
  const [slug, user, memberModel, roleModel, tenantId, includeShared = true] =
    arguments_;
  const normalizedSlug = `/${slug.replace(/^\/+|\/+$/g, "")}`;
  const registeredSlug = resolveRegisteredPageSlug(normalizedSlug);
  assert(registeredSlug, 404, "error.page_not_found");
  const handler = GetPageLayoutBySlug(registeredSlug);
  assert(handler, 404, "error.page_not_found");
  const route = pagesBySlug[registeredSlug];
  assert(route, 404, "error.page_not_found");
  if (!includeShared) {
    const layout = await handler(user, memberModel, roleModel, tenantId);
    const context = await buildAccessContext(
      user,
      memberModel,
      roleModel,
      tenantId,
    );
    const routes = await annotateRegistryAccess(
      { [registeredSlug]: route },
      context,
    );
    return { route: routes[registeredSlug], layout };
  }
  const [layout, shared] = await Promise.all([
    handler(user, memberModel, roleModel, tenantId),
    buildSiteLayoutPayload(user, memberModel, roleModel, tenantId),
  ]);
  return { route: shared.siteLayout.pages[registeredSlug], shared, layout };
}

interface NavigationEntry extends Partial<
  Pick<
    PageInfo,
    | "permission"
    | "publicAccess"
    | "authOnly"
    | "module"
    | "category"
    | "isModuleRoot"
    | "bypassTenantAccessGate"
  >
> {
  fullId: string;
}

type DynamicChildren = Map<string, SiteLayoutTree[]>;

async function getRoleIdsForUser(
  memberModel: TenantMemberModel,
  user: User,
): Promise<string[]> {
  const member = await memberModel.getByUser(user._id);
  return member?.roleIds ?? [];
}

// Whether each registered permission id belongs to a surface that survives a
// tenant access gate. Two surfaces may declare the same explicit permission id;
// the namespace then only counts as bypassed when every one of them is flagged,
// so a shared id never widens the answer on behalf of a gated page.
function collectSurfaceBypassFlags(): Map<string, boolean> {
  const flags = new Map<string, boolean>();
  const entries = [
    ...Object.values(categoriesByFullId),
    ...Object.values(pagesBySlug),
  ];
  for (const entry of entries) {
    const id = resolvePagePermissionId(entry.permission, entry.fullId);
    const bypassed = entry.bypassTenantAccessGate === true;
    flags.set(id, (flags.get(id) ?? true) && bypassed);
  }
  return flags;
}

// Components and actions descend from their surface's permission id, so the
// nearest declared ancestor decides: a permission under a gated page stays out
// even when a flagged page sits higher in the same namespace.
function isBypassedPermission(
  permissionId: string,
  surfaces: Map<string, boolean>,
): boolean {
  let current = permissionId;
  for (;;) {
    const bypassed = surfaces.get(current);
    if (bypassed !== undefined) return bypassed;
    const separatorIndex = current.lastIndexOf(".");
    if (separatorIndex <= 0) return false;
    current = current.slice(0, separatorIndex);
  }
}

/**
 * What the client may still act on while a gate denies the tenant: the
 * permissions of the surfaces flagged `bypassTenantAccessGate` and of their
 * components and actions. Without this the recovery page renders but every
 * permission-gated control on it stays dead.
 *
 * When no surface carries the flag there is nothing to recover and the answer
 * stays empty — including for the wildcard, which is otherwise kept whole
 * because an owner is exactly who has to use that page. The server keeps
 * enforcing the gate on every other route either way.
 *
 * @param surfaces Bypass flag of every registered permission id, from
 * `collectSurfaceBypassFlags`.
 */
export function filterPermissionsForBypassedSurfaces(
  permissions: Set<string>,
  surfaces: Map<string, boolean>,
): Set<string> {
  const hasBypassedSurface = [...surfaces.values()].some(Boolean);
  if (!hasBypassedSurface) {
    return new Set();
  }
  if (permissions.has(WILDCARD_PERMISSION)) {
    return new Set([WILDCARD_PERMISSION]);
  }
  return new Set(
    [...permissions].filter((id) => isBypassedPermission(id, surfaces)),
  );
}

export async function resolveUserPermissions(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<string[]> {
  const context = await buildAccessContext(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return [...context.client.permissions];
}

// What a surface is called, what it is for and what it looks like are the
// caller's business only once they may reach it. The structural fields stay:
// the browser matches an unreachable slug to tell a 403 apart from a 404, and
// to send a signed-out visitor to the auth screens rather than a dead end.
function redactPresentation<T extends NavigationEntry>(entry: T): T {
  return {
    ...entry,
    displayName: "",
    description: undefined,
    icon: undefined,
    permission: undefined,
  };
}

async function annotateRegistryAccess<T extends NavigationEntry>(
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

async function annotateSiteLayoutAccess(
  context: RequestAccessContext,
): Promise<SiteLayoutWithAccess> {
  return {
    pages: await annotateRegistryAccess(pagesBySlug, context),
    categories: await annotateRegistryAccess(
      buildNavigableCategoryIndex(),
      context,
    ),
  };
}

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

  const dynamicChildren = await resolveDynamicChildren(
    user,
    tenantId,
    accessContext,
  );

  return {
    siteLayout: await annotateSiteLayoutAccess(accessContext),
    siteLayoutTree: await addAccessToTree(
      navigationTree,
      accessContext,
      true,
      dynamicChildren,
    ),
    quickActions: await getQuickActionsForUser((target) =>
      resolveQuickActionTarget(target, accessContext),
    ),
    modules: await buildModuleAccessMap(accessContext),
    isOwner: accessContext.gated.isOwner,
  };
}

async function buildAccessContext(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<RequestAccessContext> {
  const isAuthenticated = !!user;
  if (!user) {
    const anonymous: AccessContext = {
      permissions: new Set(),
      isOwner: false,
      isAuthenticated,
    };
    return {
      gated: anonymous,
      ungated: anonymous,
      client: anonymous,
      gateDenied: false,
      entryAccess: new Map(),
    };
  }
  const roleIds = await getRoleIdsForUser(memberModel, user);
  const permissions = await GetEffectiveUserPermissions(
    user,
    tenantId,
    roleIds,
    roleModel,
  );
  const ungated: AccessContext = {
    permissions,
    isOwner: permissions.has(WILDCARD_PERMISSION),
    isAuthenticated,
  };
  // A denied tenant keeps an empty context instead of a 403: the site layout
  // must still resolve so public/authOnly pages (auth screens, the suspended
  // workspace screen) stay reachable while product entries lose access.
  const access = await CheckTenantAccess(user._id, tenantId);
  if (access.allowed) {
    return {
      gated: ungated,
      ungated,
      client: ungated,
      gateDenied: false,
      entryAccess: new Map(),
    };
  }
  return buildDeniedAccessContext(ungated);
}

// A denied tenant keeps an authenticated session: product surfaces read an
// emptied set, and the client only keeps what the surfaces flagged
// `bypassTenantAccessGate` need.
function buildDeniedAccessContext(
  ungated: AccessContext,
): RequestAccessContext {
  const { isAuthenticated } = ungated;
  const clientPermissions = filterPermissionsForBypassedSurfaces(
    ungated.permissions,
    collectSurfaceBypassFlags(),
  );
  return {
    gated: { permissions: new Set(), isOwner: false, isAuthenticated },
    ungated,
    client: {
      permissions: clientPermissions,
      isOwner: clientPermissions.has(WILDCARD_PERMISSION),
      isAuthenticated,
    },
    gateDenied: true,
    entryAccess: new Map(),
  };
}

function selectEntryContext(
  entry: NavigationEntry,
  context: RequestAccessContext,
): AccessContext {
  return entry.bypassTenantAccessGate === true
    ? context.ungated
    : context.gated;
}

async function computeEntryAccess(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  const cacheKey = entry.fullId;
  const cached = context.entryAccess.get(cacheKey);
  if (cached) return cached;
  const result = computeEntryAccessUncached(entry, context);
  context.entryAccess.set(cacheKey, result);
  return result;
}

async function computeEntryAccessUncached(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  // A surface the gate shuts out is out, whatever its permissions say: its
  // routes assert the gate, so anything else here would only ever offer a
  // 403. Decided before the permission checks and outright, never by emptying
  // a permission set — `HasPermission`'s `defaultGranted` fallback would have
  // let those surfaces back in.
  if (!gateAllowsSurface(entry, context.gateDenied)) return false;
  const effective = selectEntryContext(entry, context);
  if (effective.isOwner) return true;
  if (isInsideModule(entry)) return false;
  if (entry.authOnly === true) return effective.isAuthenticated;
  if (effective.isAuthenticated) {
    // Under a denying gate, an unflagged surface must not survive through
    // HasPermission's `defaultGranted` fallback: its layout route still
    // asserts the gate, so the entry would only ever 403. Mirror the
    // pagelayout exemptions instead — public surfaces stay, the rest is out
    // (the gated set is empty, so no literal grant can match either).
    if (context.gateDenied && entry.bypassTenantAccessGate !== true) {
      return entry.publicAccess === true;
    }
    return HasPermission(
      effective.permissions,
      resolvePagePermissionId(entry.permission, entry.fullId),
    );
  }
  return entry.publicAccess === true;
}

async function addAccessToTree(
  node: SiteLayoutTree,
  context: RequestAccessContext,
  isRoot: boolean,
  dynamic: DynamicChildren,
): Promise<SiteLayoutTree> {
  const hasAccess = isRoot ? true : await computeEntryAccess(node, context);

  const childrenWithAccess: Record<string, SiteLayoutTree> = {};
  for (const [key, child] of Object.entries(node.children)) {
    childrenWithAccess[key] = await addAccessToTree(
      child,
      context,
      false,
      dynamic,
    );
  }

  // Redacted like the flat registries: an unreachable branch keeps its shape
  // so its accessible descendants stay addressable, but stops carrying what
  // it is called and what it holds.
  const visible = hasAccess ? node : redactPresentation(node);

  const dynamicChildren = dynamic.get(node.fullId);
  if (!dynamicChildren) {
    return { ...visible, hasAccess, children: childrenWithAccess };
  }
  const children = mergeDynamicChildren(
    node.fullId,
    childrenWithAccess,
    dynamicChildren,
  );
  return {
    ...visible,
    hasAccess,
    children,
    childrenOrders: sortChildIdsByOrder(children),
  };
}

// Grafted onto the per-request copy produced above, never onto `navigationTree`:
// the dynamic entries of one tenant can therefore never reach another tenant's
// site layout. A dynamic entry never shadows an existing child — static or from
// an earlier provider.
function mergeDynamicChildren(
  categoryFullId: string,
  children: Record<string, SiteLayoutTree>,
  dynamicChildren: SiteLayoutTree[],
): Record<string, SiteLayoutTree> {
  const merged = { ...children };
  // Several providers pool their entries into one category, so the verdict
  // goes to the provider whose entry was dropped rather than to the category:
  // the one that has to hear about it, and the only key under which a second
  // provider colliding for its own reasons is still reported.
  const category = findNavigationEntryByFullId(categoryFullId);
  for (const node of dynamicChildren) {
    if (merged[node.id]) {
      const source = nodeProviders.get(node) ?? category;
      if (source) {
        warnOnceFor(
          source,
          "colliding-entry",
          `[dms] dynamic menu entry "${node.id}" of category "${categoryFullId}" collides with an existing entry and was skipped.`,
        );
      }
      continue;
    }
    merged[node.id] = node;
  }
  return merged;
}

async function resolveDynamicChildren(
  user: User | undefined,
  tenantId: string,
  context: RequestAccessContext,
): Promise<DynamicChildren> {
  const resolved: DynamicChildren = new Map();
  // Providers are independent, so they run together: the request waits for the
  // slowest instead of the sum. The merge below still walks them in
  // registration order — which provider wins a colliding id must not depend on
  // which one happened to answer first.
  // Snapshot first: a module registering or unregistering while the resolvers
  // are pending would mutate the live array, and the merge below reads it by
  // index — entries would land under another provider's category, or vanish.
  const providers = [...dynamicMenuProviders];
  const perProvider = await Promise.all(
    providers.map((provider) =>
      resolveProviderNodes(provider, user, tenantId, context),
    ),
  );
  for (const [index, provider] of providers.entries()) {
    const nodes = perProvider[index];
    if (!nodes || nodes.length === 0) continue;
    const existing = resolved.get(provider.categoryFullId);
    if (existing) {
      existing.push(...nodes);
      continue;
    }
    resolved.set(provider.categoryFullId, nodes);
  }
  return resolved;
}

// A provider whose category the caller cannot reach is not resolved at all: its
// resolver never runs (no needless data access) and its entries never reach the
// payload, which the client could otherwise read even though the menu hides the
// whole category. Under a category flagged `bypassTenantAccessGate` the caller
// keeps its real permissions, exactly like the pages of that category.
async function resolveProviderNodes(
  provider: DynamicMenuProviderInfo,
  user: User | undefined,
  tenantId: string,
  context: RequestAccessContext,
): Promise<SiteLayoutTree[]> {
  const parent = findNavigationEntryByFullId(provider.categoryFullId);
  if (!parent) {
    warnOnceFor(
      provider,
      "unknown-category",
      `[dms] dynamic menu provider targets unknown category "${provider.categoryFullId}" and was skipped.`,
    );
    return [];
  }
  if (!(await computeEntryAccess(parent, context))) {
    return [];
  }
  const items = await runDynamicMenuResolver(
    provider,
    user,
    tenantId,
    selectEntryContext(parent, context).permissions,
  );
  return buildDynamicNodes(provider, items, context);
}

// A resolver runs inside /dms/sitelayout, on the critical path of every page
// load: one that hangs would hold the menu of every user of the tenant. Long
// enough for a database round trip, short enough that a stuck provider costs a
// slow menu rather than an unusable dashboard.
const RESOLVER_TIMEOUT_MS = 2000;

function withResolverTimeout<T>(
  work: Promise<T>,
  provider: DynamicMenuProviderInfo,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `resolver did not answer within ${RESOLVER_TIMEOUT_MS}ms (category "${provider.categoryFullId}")`,
        ),
      );
    }, RESOLVER_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function runDynamicMenuResolver(
  provider: DynamicMenuProviderInfo,
  user: User | undefined,
  tenantId: string,
  permissions: Set<string>,
): Promise<DynamicMenuItem[]> {
  try {
    return await withResolverTimeout(
      Promise.resolve(provider.resolver(user, tenantId, permissions)),
      provider,
    );
  } catch (error) {
    // Throwing and hanging land here alike: the provider contributes nothing
    // to this request, and its entries come back when it does.
    warnOnceFor(
      provider,
      "resolver-failed",
      `[dms] dynamic menu provider of category "${provider.categoryFullId}" failed: ${String(error)}`,
    );
    return [];
  }
}

const ID_SEPARATOR = ".";

interface ResolvedEntryTarget {
  target: PageInfo;
  link: string;
}

function resolveEntryTarget(
  provider: DynamicMenuProviderInfo,
  item: DynamicMenuItem,
): ResolvedEntryTarget | undefined {
  const entry = `[dms] dynamic menu entry "${item.id}" of category "${provider.categoryFullId}"`;
  // Dots separate the levels of a fullId, so one inside an entry id would
  // alias a nested path.
  if (item.id.includes(ID_SEPARATOR)) {
    warnOnceFor(
      provider,
      "dotted-id",
      `${entry} has a dot in its id and was skipped.`,
    );
    return undefined;
  }
  const target = pagesBySlug[item.fullSlug];
  if (!target) {
    warnOnceFor(
      provider,
      "unregistered-target",
      `${entry} targets unregistered page "${item.fullSlug}" and was skipped.`,
    );
    return undefined;
  }
  const link = fillRouteParams(item.fullSlug, item.params);
  if (link === undefined) {
    warnOnceFor(
      provider,
      "unmatched-route-params",
      `${entry} does not fill exactly the route parameters of "${item.fullSlug}" and was skipped.`,
    );
    return undefined;
  }
  return { target, link };
}

async function buildDynamicNodes(
  provider: DynamicMenuProviderInfo,
  items: DynamicMenuItem[],
  context: RequestAccessContext,
): Promise<SiteLayoutTree[]> {
  const { categoryFullId } = provider;
  const nodes: SiteLayoutTree[] = [];
  // Entries of one provider usually share a single target page: resolving that
  // page's access once per request keeps the check off the per-entry path.
  const targetAccess = new Map<string, boolean>();
  for (const item of items) {
    const resolved = resolveEntryTarget(provider, item);
    if (!resolved) continue;
    const { target, link } = resolved;
    if (!(await isTargetPageReachable(target, context, targetAccess))) {
      continue;
    }
    if (
      item.permissionId &&
      !clientHoldsPermission(context, item.permissionId)
    ) {
      continue;
    }
    const node = buildDynamicNode(categoryFullId, item, target, link);
    nodeProviders.set(node, provider);
    nodes.push(node);
  }
  return nodes;
}

// Mirrors the check the browser itself performs (usePermissions.hasPermission):
// the wildcard, or a literal member of the set it received. The server-side
// `defaultGranted` fallback of HasPermission is deliberately not consulted — the
// client never receives those ids, so an entry granted that way would render
// controls the browser keeps disabled. Under a denying gate the set is narrowed
// to the surfaces flagged `bypassTenantAccessGate`, so only recovery entries
// survive.
function clientHoldsPermission(
  context: RequestAccessContext,
  permissionId: string,
): boolean {
  const { permissions } = context.client;
  return permissions.has(WILDCARD_PERMISSION) || permissions.has(permissionId);
}

// An entry may not offer a link the caller would be refused on: the target page
// is checked like any other navigation entry, so its own permission — and its
// own `bypassTenantAccessGate` — decide.
async function isTargetPageReachable(
  target: PageInfo,
  context: RequestAccessContext,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const cached = cache.get(target.fullSlug);
  if (cached !== undefined) return cached;
  const reachable = await computeEntryAccess(target, context);
  cache.set(target.fullSlug, reachable);
  return reachable;
}

function buildDynamicNode(
  categoryFullId: string,
  item: DynamicMenuItem,
  target: PageInfo,
  link: string,
): SiteLayoutTree {
  const {
    id,
    permissionId: _permissionId,
    params: _params,
    ...menuFields
  } = item;
  return {
    ...menuFields,
    // The browser links an entry to its `fullSlug`, so it carries the filled
    // link rather than the page's `:name` pattern.
    fullSlug: link,
    id,
    fullId: `${categoryFullId}.${id}`,
    layoutUrl: target.layoutUrl,
    type: "link",
    category: undefined,
    children: {},
    childrenOrders: [],
    hasAccess: true,
  };
}

// A quick action is an affordance of its page, never a surface of its own:
// resolving it against that page is what makes its permission, and the tenant
// access gate, apply to it — for free and without a second rule to keep in
// step. A target whose page is gone is a declaration error, and warned about
// once rather than silently dropped.
async function resolveQuickActionTarget(
  target: QuickActionTarget,
  context: RequestAccessContext,
): Promise<QuickActionTargetSerialized | undefined> {
  const meta = GetMetadata(target.page, PageMetadata);
  const pageInfo = meta.pageInfo;
  if (!pageInfo) {
    warnOnceFor(
      target,
      "unregistered-page",
      `[DMS] Quick action targets "${target.page.name}", which is not a registered page: the action is not served.`,
    );
    return undefined;
  }
  if (!(await computeEntryAccess(pageInfo, context))) return undefined;

  if (target.type === "event") {
    return { type: "event", name: target.name, payload: target.payload };
  }
  if (target.type === "navigate") {
    return { type: "navigate", to: pageInfo.fullSlug, query: target.query };
  }

  const resolved = resolveOpenFormComponent(meta, target);
  if (!resolved) return undefined;
  const [componentKey, component] = resolved;

  // Opening a creation form takes more than reaching the page: the component's
  // own `add` permission decides, so the action never offers a form its target
  // would refuse to submit. Derived from the component itself — the caller
  // names no permission and none can go stale. Read under the same context the
  // page itself was judged with, or a recovery page's own form would be
  // dropped by the emptied set the gate hands ordinary surfaces.
  const addPermission = component.getAction("add")?.permissionId;
  if (
    addPermission &&
    !(await HasPermission(
      selectEntryContext(pageInfo, context).permissions,
      addPermission,
    ))
  ) {
    return undefined;
  }
  return { type: "openForm", to: pageInfo.fullSlug, component: componentKey };
}

/**
 * The form-capable component an `openForm` action opens, and the key the
 * browser addresses it by.
 *
 * Always resolved here rather than left to the client: several table views can
 * share a page, and an unnamed target would have every one of them open a form
 * at once. Naming the component object — not a string — is what keeps a
 * renamed or moved component from leaving a dangling reference behind.
 */
function resolveOpenFormComponent(
  meta: PageMetadata,
  target: Extract<QuickActionTarget, { type: "openForm" }>,
): [string, Component] | undefined {
  const requested = target.component;
  const entries = Object.entries(meta.components);
  if (requested) {
    const resolved = resolveComponentTarget(requested, new Map(entries));
    if (!resolved) {
      warnOnceFor(
        target,
        "unknown-component",
        `[DMS] Quick action targets a component that page "${meta.pageInfo?.fullId}" does not mount: the action is not served.`,
      );
      return undefined;
    }
    return [componentTargetClientId(resolved), resolved.component];
  }

  const formCapable = entries.filter(([, candidate]) =>
    candidate.getAction("add"),
  );
  if (formCapable.length === 1) return formCapable[0];
  warnOnceFor(
    target,
    "ambiguous-form",
    `[DMS] Quick action opens a form on page "${meta.pageInfo?.fullId}", which mounts ${formCapable.length} components that can create a row: name the one it means. The action is not served.`,
  );
  return undefined;
}

async function buildModuleAccessMap(
  context: RequestAccessContext,
): Promise<Record<string, ModuleInfo & AccessFlag>> {
  const result: Record<string, ModuleInfo & AccessFlag> = {};
  for (const [moduleId, info] of Object.entries(moduleRegistry)) {
    const hasAccess = await computeModuleAccess(moduleId, context);
    // Modules are owner-only surfaces: without this, every member learned the
    // name and purpose of everything installed on the deployment.
    result[moduleId] = hasAccess
      ? { ...info, hasAccess }
      : { ...info, title: "", description: "", icon: "", hasAccess };
  }
  return result;
}

async function computeModuleAccess(
  _moduleId: string,
  context: RequestAccessContext,
): Promise<boolean> {
  return context.gated.isOwner;
}

function resolveModuleLandingSlug(info: ModuleInfo): string {
  const modulePages = Object.values(pagesBySlug).filter(
    (page) => page.module === info.id,
  );

  if (modulePages.length === 0) {
    return `${MODULE_URL_PREFIX}/${info.id}`;
  }

  if (info.landingPage) {
    const target = modulePages.find((page) => page.id === info.landingPage);
    if (target) return target.fullSlug;
    Logging.Warn(
      `[dms] module "${info.id}" declares landingPage "${info.landingPage}" but no page with that id exists in the module. Falling back to the first page by order.`,
    );
  }

  const sorted = [...modulePages].sort(comparePagesForLanding);
  return sorted[0].fullSlug;
}

function comparePagesForLanding(a: PageInfo, b: PageInfo): number {
  const orderDelta = (a.order ?? 0) - (b.order ?? 0);
  if (orderDelta !== 0) return orderDelta;
  return a.id.localeCompare(b.id);
}
