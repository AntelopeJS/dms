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
import {
  Action,
  type Component,
  type ComponentButton,
} from "@antelopejs/interface-dms/component";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  type CategoryInfo,
  ClearPageLayoutBySlug,
  type DynamicMenuItem,
  type DynamicMenuProviderInfo,
  GetPageLayoutBySlug,
  isInsideModule,
  MODULE_URL_PREFIX,
  type ModuleCatalogContext,
  type ModuleInfo,
  type ModuleReadoutLine,
  type ModuleReadoutTone,
  type ModuleStatus,
  type PageExtensionInfo,
  type PageInfo,
  type PageLayout,
  type PageLayoutHandler,
  PageMetadata,
} from "@antelopejs/interface-dms/page";
import {
  applyPageExtension,
  clearModuleResolution,
  clearPageMetadata,
  revokePageExtension,
} from "@antelopejs/interface-dms/page/internal/categories";
import { pageMetadataByFullId } from "@antelopejs/interface-dms/page/internal/registry";
import { isPermissionGated } from "@antelopejs/interface-dms/internal/permission-gate";
import {
  GetEffectiveUserPermissions,
  HasPermission,
  UnmarkModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";
import type { LayoutBannerContext } from "@antelopejs/interface-dms/layout-banners";
import type { QuickActionTarget } from "@antelopejs/interface-dms/quick-actions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { CheckTenantAccess } from "@antelopejs/interface-dms/tenant-access";
import { gateAllowsSurface } from "@antelopejs/interface-dms/internal/tenant-access";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  componentTargetClientId,
  resolveComponentTarget,
} from "@antelopejs/interface-dms/page/internal/component-target";
import {
  buildMenuTopic,
  clearPageTopics,
  getRealtimeBroker,
  MENU_BROADCAST_TOPIC,
  MENU_CHANGED_EVENT_TYPE,
} from "../../realtime";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { scheduleBroadcast, setSlugProvider } from "./dev-reload";
import { assertPageSessionAccepted } from "./stale-session";
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
import {
  resolveLayoutBanners,
  type LayoutBannerSerialized,
} from "./layout-banners";
import { fillRouteParams } from "./route-params";
import {
  resolveMenuNavBadges,
  withNavBadge,
  withTreeNavBadges,
} from "./nav-badges";
import { withResolverTimeout } from "./resolver-timeout";
import { warnOnceFor } from "./warn-once";
import {
  aggregatePreviewMenu,
  findHeaderActionsHiddenByPreview,
  findQuickActionsHiddenByPreview,
  type HeaderActionAccess,
  previewCacheKey,
  PreviewScopeCache,
  type PreviewMenuNode,
  type PreviewMenuStates,
  readHeaderActions,
  type ServedQuickActions,
} from "./permission-preview";
import { runInBatches } from "../../utils/run-in-batches";

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

// Keyed on the category id rather than a registration: the category is what
// is missing, so there is nothing else to key on. Never forgotten, so a
// category that stays missing across hot reloads is reported once rather than
// on each reload.
const warnedMissingCategories = new Set<string>();
// Categories seen missing since the last check, and the timer that checks
// them once registrations settle.
const suspectedMissingCategories = new Set<string>();
let missingCategoryCheck: NodeJS.Timeout | undefined;
// Same window as the reload broadcast (`dev-reload.ts`): a hot reload's
// unregister and register bursts land within it.
const MISSING_CATEGORY_SETTLE_MS = 250;

// Entries outliving or preceding their category are shown at its parent's
// level (see `buildChildrenWithAccess`), so the menu no longer shows that
// something is missing: the log has to. Not on the spot, though: a hot reload
// or a stop unregisters a category before the pages under it, and a module may
// register a page before its category, so the entries are only orphans if the
// category is still missing once registrations settle.
function suspectMissingCategory(categoryFullId: string): void {
  if (warnedMissingCategories.has(categoryFullId)) return;
  suspectedMissingCategories.add(categoryFullId);
  missingCategoryCheck ??= setTimeout(
    reportMissingCategories,
    MISSING_CATEGORY_SETTLE_MS,
  );
  missingCategoryCheck.unref();
}

function findTreeNode(fullId: string): SiteLayoutTree | undefined {
  let node: SiteLayoutTree | undefined = navigationTree;
  for (const part of fullId.split(".")) {
    node = node?.children[part];
  }
  return node;
}

/**
 * Warns about every suspected category that is still missing while entries
 * hang under it. Runs on its own once registrations settle; exported so tests
 * need not wait for it.
 */
export function reportMissingCategories(): void {
  clearTimeout(missingCategoryCheck);
  missingCategoryCheck = undefined;
  for (const categoryFullId of suspectedMissingCategories) {
    const node = findTreeNode(categoryFullId);
    const heldKeys = node ? Object.keys(node.children) : [];
    if (
      categoryFullId in categoriesByFullId ||
      !node ||
      !isContainerWithoutEntry(node) ||
      heldKeys.length === 0
    ) {
      continue;
    }
    warnedMissingCategories.add(categoryFullId);
    const entries = heldKeys
      .map((key) => `"${categoryFullId}.${key}"`)
      .join(", ");
    Logging.Warn(
      `[dms] category "${categoryFullId}" is not registered but ${entries} hang under it: the menu shows them at its parent's level.`,
    );
  }
  suspectedMissingCategories.clear();
}

/** Drops a pending missing-category check, which would otherwise outlive teardown. */
export function cancelMissingCategoryCheck(): void {
  clearTimeout(missingCategoryCheck);
  missingCategoryCheck = undefined;
  suspectedMissingCategories.clear();
}

function ensureContainer(
  level: Record<string, SiteLayoutTree>,
  containerFullId: string,
): SiteLayoutTree {
  const key = containerFullId.slice(containerFullId.lastIndexOf(".") + 1);
  const isRegistered =
    Boolean(level[key]?.fullId) || containerFullId in categoriesByFullId;
  if (!isRegistered) suspectMissingCategory(containerFullId);
  level[key] ??= {
    displayName: "none",
    children: {},
    childrenOrders: [],
    id: "",
    fullId: "",
    fullSlug: "",
    category: undefined,
  };
  return level[key];
}

function addToTree(newPageInfo: PageInfo | CategoryInfo) {
  const parts = newPageInfo.fullId.split(".");
  let currentLevel = navigationTree.children;

  for (let i = 0; i < parts.length - 1; i++) {
    const containerFullId = parts.slice(0, i + 1).join(".");
    currentLevel = ensureContainer(currentLevel, containerFullId).children;
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

/**
 * Position of every registered menu entry in the main menu: depth first, in
 * the order the sidebar lists them (`childrenOrders`, sorted by
 * `compareMenuChildren`). Keyed by the permission id guarding the entry, and
 * by its full id when that differs, so a permission editor can list its
 * pages and categories the way the menu does.
 */
export function GetMenuOrder(): Map<string, number> {
  const positions = new Map<string, number>();
  let position = 0;
  const visit = (node: SiteLayoutTree): void => {
    for (const key of node.childrenOrders) {
      const child = node.children[key];
      if (!child) continue;
      if (!isContainerWithoutEntry(child)) {
        const permissionId = resolvePagePermissionId(
          child.permission,
          child.fullId,
        );
        if (!positions.has(permissionId)) positions.set(permissionId, position);
        if (!positions.has(child.fullId)) positions.set(child.fullId, position);
        position += 1;
      }
      visit(child);
    }
  };
  visit(navigationTree);
  return positions;
}

/**
 * Permission ids of the registered categories (`Category`, `RootCategory`):
 * the headings and groups of the menu, as opposed to its pages. A permission
 * editor uses them to leave out a heading with nothing below it to grant.
 */
export function GetCategoryPermissionIds(): Set<string> {
  return new Set(
    Object.values(categoriesByFullId).map((category) =>
      resolvePagePermissionId(category.permission, category.fullId),
    ),
  );
}

/**
 * Permission ids of every registered menu entry, pages and categories alike,
 * as opposed to the components and actions declared on a page. A permission
 * editor uses them to keep listing the entries filed under one every member
 * holds (the settings root).
 */
export function GetMenuEntryPermissionIds(): Set<string> {
  return new Set(
    [...Object.values(pagesBySlug), ...Object.values(categoriesByFullId)].map(
      (entry) => resolvePagePermissionId(entry.permission, entry.fullId),
    ),
  );
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

  const key = parts[parts.length - 1];
  const target = currentLevel[key];
  if (!target) return;
  const heldKeys = Object.keys(target.children);
  if (heldKeys.length > 0) {
    // Still holds registered descendants: blank the entry so nothing shows it,
    // and keep it as the container they hang from.
    suspectMissingCategory(fullId);
    currentLevel[key] = {
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
// The page a dynamic node leads to, for the same reason: a role preview reads
// what that page loses to tell whether the entry is partially locked.
const nodeTargets = new WeakMap<object, PageInfo>();
// Bumped by every structural change, so a role preview never answers for a
// page registered, changed or gone since from what it read before.
let previewStructureVersion = 0;

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
  previewStructureVersion++;
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

  // A pending trailing publish covers this call even once the window has
  // elapsed: its timer is merely late, held back by synchronous work, and
  // publishing now as well would send the burst's trailing event twice.
  if (pendingMenuNotifications.has(target)) return;
  const sinceLast = Date.now() - (lastMenuPublishAt.get(target) ?? 0);
  if (sinceLast >= MENU_NOTIFICATION_WINDOW_MS) {
    publish();
    return;
  }
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
        clearPageMetadata(pageInfo.fullId, pageInfo);
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
      clearPageMetadata(pageInfo.fullId, pageInfo);
      // …and its layout handler, which `/dms/pagelayout` resolves by slug and
      // would otherwise keep serving the page after its module is gone.
      ClearPageLayoutBySlug(pageInfo.fullSlug);
      // …and the realtime topics registered against it: they are the allowlist
      // the SSE routes check subscriptions against. Cleared here rather than
      // through the realtime proxy, whose entries are keyed per topic and
      // belong to the modules that registered them.
      clearPageTopics(pageInfo.fullId);
    },
  };

  export const RegisterModule = {
    register: (info: ModuleInfo) => {
      moduleRegistry[info.id] = info;
      notifyStructureChanged();
    },
    unregister: (info: ModuleInfo) => {
      delete moduleRegistry[info.id];
      clearModuleResolution(info.id);
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
      applyPageExtension(info);
      scheduleBroadcast();
    },
    unregister: (info: PageExtensionInfo) => {
      revokePageExtension(info);
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

  @Parameter("authorization", "header")
  declare authorization: string | undefined;

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
      requestContext,
    );
  }

  @Get("/modules-listing")
  async modulesListing(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<ModuleCatalogEntry[]> {
    const tenantId = getRequestTenantId(requestContext);
    const accessContext = await buildAccessContext(
      user,
      memberModel,
      roleModel,
      tenantId,
    );
    assert(accessContext.gated.isOwner, HTTP_FORBIDDEN, ERROR_UNAUTHORIZED);

    const catalogContext: ModuleCatalogContext = { user, tenantId };
    return Promise.all(
      Object.values(moduleRegistry).map(async (info) => {
        const [status, readout] = await Promise.all([
          runModuleStatusHook(info, catalogContext),
          runModuleReadoutHook(info, catalogContext),
        ]);
        return {
          ...presentModuleInfo(info),
          // Same rule as the site layout's module map, so the catalog and
          // the sidebar never disagree on what a caller can open.
          hasAccess: await computeModuleAccess(info.id, accessContext),
          landingSlug: resolveModuleLandingSlug(info),
          status,
          readout,
        };
      }),
    );
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
    const payload = await buildPagePayload(
      this.pagePath,
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
      this.sharedPage !== OMIT_SHARED_PAGE_QUERY_VALUE,
      requestContext,
    );
    await assertPageSessionAccepted(payload, !!user, this.authorization);
    return payload;
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
  /**
   * Carried inside the site layout rather than beside it: every renderer
   * already hydrates this object from a page's shared payload, so the banners
   * reach the server-rendered page with no renderer change.
   */
  banners: LayoutBannerSerialized[];
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
  requestContext?: RequestContext,
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
    buildSiteLayoutPayload(
      user,
      memberModel,
      roleModel,
      tenantId,
      requestContext,
    ),
  ]);
  return { route: shared.siteLayout.pages[registeredSlug], shared, layout };
}

/** The page a permission preview runs on, read with the viewer's own access. */
export interface PermissionPreviewPage {
  fullId: string;
  displayName: string;
  /** Root of the ids its components are filtered by. */
  pagePermissionId: string;
  /** False for public and auth-only pages, whose components are never filtered. */
  filtersComponents: boolean;
  /** Whether the previewed set could open the page. */
  hiddenInPreview: boolean;
  /** The components as the viewer is served them. */
  components: PageLayout["components"];
  /** Header actions the viewer is shown and the set would not be. */
  hiddenHeaderActions: string[];
}

/** The two permission sets a preview compares. */
export interface PermissionPreviewGrants {
  /** The viewer's effective permissions. */
  real: Set<string>;
  /** The previewed set. */
  preview: Set<string>;
}

/**
 * Whether the previewed set loses anything on a page it can open: a block, an
 * action of one, or a header action. It must decide from the page and the two
 * sets alone — its answers are cached per viewer and set.
 */
export type PreviewPageLossCheck = (
  page: PermissionPreviewPage,
  grants: PermissionPreviewGrants,
) => Promise<boolean>;

/** What a permission preview changes about the menu and one page. */
export interface PermissionPreviewAccess {
  /**
   * Menu entries the viewer reaches and the set would not: registered pages
   * and categories (labels included) and dynamic entries, by `fullId` — and
   * the groups whose every entry the set is refused.
   */
  hiddenEntries: string[];
  /**
   * Menu entries the set opens without all the viewer has there: a page
   * losing a block or an action (`pageLoses`), a dynamic entry whose page
   * does, a group holding a refused or partial entry.
   */
  partialEntries: string[];
  /** Quick actions (`category:id`) the viewer is served and the set is not. */
  hiddenQuickActions: string[];
  page: PermissionPreviewPage | null;
}

// The previewed set read the way `buildAccessContext` reads a real one. The
// viewer's tenant gate still applies: a preview never reopens what the gate
// closed for the viewer.
function buildPreviewAccessContext(
  previewPermissions: Set<string>,
  real: RequestAccessContext,
): RequestAccessContext {
  const preview: AccessContext = {
    permissions: previewPermissions,
    isOwner: previewPermissions.has(WILDCARD_PERMISSION),
    isAuthenticated: true,
  };
  if (!real.gateDenied) {
    return {
      gated: preview,
      ungated: preview,
      client: preview,
      gateDenied: false,
      entryAccess: new Map(),
    };
  }
  return buildDeniedAccessContext(preview);
}

// Every category counts, labels and URL-transparent ones included: the menu
// draws them all, and a branch the set cannot reach must read as locked too.
async function findRegisteredEntriesHiddenByPreview(
  real: RequestAccessContext,
  preview: RequestAccessContext,
): Promise<string[]> {
  const entries = [
    ...Object.values(pagesBySlug),
    ...Object.values(categoriesByFullId),
  ];
  const hidden: string[] = [];
  for (const entry of entries) {
    if (!(await listsEntry(entry, real))) continue;
    if (!(await listsEntry(entry, preview))) hidden.push(entry.fullId);
  }
  return hidden;
}

// Dynamic entries resolve per user: the providers run for the viewer under
// both sets, and an entry the viewer is served but the previewed set is not —
// its category, its target page or its own permission refused — is hidden.
function findDynamicEntriesHiddenByPreview(
  served: DynamicChildren,
  previewed: DynamicChildren,
): string[] {
  const kept = new Set(
    [...previewed.values()].flat().map((node) => node.fullId),
  );
  return [...served.values()]
    .flat()
    .map((node) => node.fullId)
    .filter((fullId) => !kept.has(fullId));
}

/** Who previews, with which permission set, and on which page. */
export interface PermissionPreviewRequest {
  /** Path of the previewed page; the menu alone when omitted. */
  path?: string;
  user: User;
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
  tenantId: string;
  previewPermissions: Set<string>;
  /**
   * Decides, for each page of the menu the set can open, whether it loses
   * something there; those entries are then partial. Without it, no page
   * layout is read for the menu and only groups can be partial.
   */
  pageLoses?: PreviewPageLossCheck;
}

// The page layout exactly as a member holding the previewed set is served it:
// the page's own resolver, fed a member whose only role grants the set. Read
// for its header actions and custom buttons, never sent to the browser.
function previewMemberModels(previewPermissions: Set<string>): {
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
} {
  const roleIds = [PREVIEW_ROLE_ID];
  const roles = [
    { _id: PREVIEW_ROLE_ID, permissions: [...previewPermissions] },
  ];
  // Partial doubles: the layout resolver only reads a member's role ids and
  // those roles' permissions, so these two methods are all it reaches.
  // oxlint-disable anti-slop/no-chained-type-assertions
  return {
    memberModel: {
      getByUser: async () => ({ roleIds }),
    } as unknown as TenantMemberModel,
    roleModel: { getBy: async () => roles } as unknown as RoleModel,
  };
  // oxlint-enable anti-slop/no-chained-type-assertions
}

// The viewer's own models, each answer read once however many page layouts
// the preview resolves: every resolver asks for the same member and roles.
function memoizeViewerModels(
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
): { memberModel: TenantMemberModel; roleModel: RoleModel } {
  const answers = new Map<string, Promise<unknown>>();
  const remember = (
    key: string,
    read: () => PromiseLike<unknown>,
  ): Promise<unknown> => {
    const known = answers.get(key);
    if (known) return known;
    const pending = Promise.resolve(read());
    answers.set(key, pending);
    return pending;
  };
  // Partial doubles, like `previewMemberModels`: the layout resolver reaches
  // these two methods only.
  // oxlint-disable anti-slop/no-chained-type-assertions
  return {
    memberModel: {
      getByUser: (userId: string) =>
        remember(`member:${userId}`, () => memberModel.getByUser(userId)),
    } as unknown as TenantMemberModel,
    roleModel: {
      getBy: (...args: Parameters<RoleModel["getBy"]>) =>
        remember(`roles:${JSON.stringify(args)}`, () =>
          roleModel.getBy(...args),
        ),
    } as unknown as RoleModel,
  };
  // oxlint-enable anti-slop/no-chained-type-assertions
}

// Answers of `pageLoses`, per check: a preview tab asks again on every page
// it moves to and on every edit, and each ask would otherwise resolve the
// layout of every page. Short-lived, so data-driven filters catch up.
const PREVIEW_LOSS_TTL_MS = 30_000;
const PREVIEW_LOSS_MAX_SCOPES = 16;
// Page layouts a preview resolves at once: each may query data.
const PREVIEW_PAGE_CONCURRENCY = 4;

const PREVIEW_ROLE_ID = "dms-permission-preview";

async function findPreviewHeaderActions(
  handler: PageLayoutHandler,
  layout: PageLayout,
  request: PermissionPreviewRequest,
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions },
): Promise<string[]> {
  const viewerActions = readHeaderActions(layout.layout);
  if (viewerActions.length === 0) return [];
  const { memberModel, roleModel } = previewMemberModels(
    request.previewPermissions,
  );
  // Never an owner: the previewed set is the role's, without the wildcard.
  // The viewer stays the prototype, so everything else reads through.
  const previewUser: User = Object.assign(Object.create(request.user), {
    owner: false,
  });
  const previewLayout = await handler(
    previewUser,
    memberModel,
    roleModel,
    request.tenantId,
  );
  const viewer: HeaderActionAccess = {
    headerActions: viewerActions,
    quickActions: quickActions.real,
  };
  const preview: HeaderActionAccess = {
    headerActions: readHeaderActions(previewLayout.layout),
    quickActions: quickActions.preview,
  };
  return findHeaderActionsHiddenByPreview(viewer, preview);
}

/** How one page of a preview is read, besides the page itself. */
interface PreviewPageReading {
  request: PermissionPreviewRequest;
  hiddenInPreview: boolean;
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions };
  /** The viewer's layouts of this scope, by page `fullId`. */
  layouts: Map<string, Promise<PageLayout>>;
}

// The viewer's layout does not depend on the previewed set: read once per
// viewer and access, whatever set the editor previews next. A failed read is
// not kept.
function readViewerLayout(
  route: PageInfo,
  handler: PageLayoutHandler,
  { request, layouts }: PreviewPageReading,
): Promise<PageLayout> {
  const known = layouts.get(route.fullId);
  if (known) return known;
  const { user, memberModel, roleModel, tenantId } = request;
  const layout = handler(user, memberModel, roleModel, tenantId);
  layouts.set(route.fullId, layout);
  layout.catch(() => layouts.delete(route.fullId));
  return layout;
}

const viewerLayoutCache = new PreviewScopeCache<PageLayout>(
  PREVIEW_LOSS_TTL_MS,
  PREVIEW_LOSS_MAX_SCOPES,
);

function viewerLayoutsFor(
  request: PermissionPreviewRequest,
  real: RequestAccessContext,
): Map<string, Promise<PageLayout>> {
  return viewerLayoutCache.pagesFor(
    previewCacheKey({
      tenantId: request.tenantId,
      userId: request.user._id,
      structureVersion: previewStructureVersion,
      real: real.ungated.permissions,
      preview: [],
    }),
  );
}

// A page the viewer opens, read with the viewer's own access: its layout is
// the one the viewer is served, and it never leaves the server.
async function readPreviewPage(
  route: PageInfo,
  handler: PageLayoutHandler,
  reading: PreviewPageReading,
): Promise<PermissionPreviewPage> {
  const { request, hiddenInPreview, quickActions } = reading;
  const layout = await readViewerLayout(route, handler, reading);
  return {
    fullId: route.fullId,
    displayName: route.displayName,
    pagePermissionId: resolvePagePermissionId(route.permission, route.fullId),
    filtersComponents:
      route.publicAccess !== true &&
      route.authOnly !== true &&
      route.noComponentPermissions !== true,
    hiddenInPreview,
    components: layout.components,
    // A page the set cannot open takes its whole header with it.
    hiddenHeaderActions: hiddenInPreview
      ? readHeaderActions(layout.layout).map((action) => action.id)
      : await findPreviewHeaderActions(handler, layout, request, quickActions),
  };
}

async function resolvePreviewPage(
  path: string,
  request: PermissionPreviewRequest,
  contexts: { real: RequestAccessContext; preview: RequestAccessContext },
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions },
): Promise<PermissionPreviewPage | null> {
  const normalizedSlug = `/${path.replace(/^\/+|\/+$/g, "")}`;
  const registeredSlug = resolveRegisteredPageSlug(normalizedSlug);
  const route = registeredSlug ? pagesBySlug[registeredSlug] : undefined;
  const handler = registeredSlug
    ? GetPageLayoutBySlug(registeredSlug)
    : undefined;
  if (!route || !handler) return null;
  // A page the viewer cannot open has nothing to preview: its layout is never
  // read, so the preview cannot serve what the viewer is refused.
  if (!(await computeEntryAccess(route, contexts.real))) return null;
  const hiddenInPreview = !(await computeEntryAccess(route, contexts.preview));
  return readPreviewPage(route, handler, {
    request,
    hiddenInPreview,
    quickActions,
    layouts: viewerLayoutsFor(request, contexts.real),
  });
}

const previewLossCaches = new WeakMap<
  PreviewPageLossCheck,
  PreviewScopeCache<boolean>
>();

function previewLossCacheFor(
  check: PreviewPageLossCheck,
): PreviewScopeCache<boolean> {
  let cache = previewLossCaches.get(check);
  if (!cache) {
    cache = new PreviewScopeCache<boolean>(
      PREVIEW_LOSS_TTL_MS,
      PREVIEW_LOSS_MAX_SCOPES,
    );
    previewLossCaches.set(check, cache);
  }
  return cache;
}

interface PreviewMenuReading {
  request: PermissionPreviewRequest;
  contexts: { real: RequestAccessContext; preview: RequestAccessContext };
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions };
  served: DynamicChildren;
  denied: Set<string>;
}

// The menu as the viewer is served it, reduced to what the aggregation reads.
// An entry the viewer cannot reach is transparent: what it holds still
// counts, at its level.
function collectPreviewMenuNodes(
  node: SiteLayoutTree,
  pageIds: ReadonlySet<string>,
): PreviewMenuNode[] {
  return Object.values(node.children).flatMap((child) => {
    const children = collectPreviewMenuNodes(child, pageIds);
    if (!child.hasAccess) return children;
    return [
      {
        fullId: child.fullId,
        opensPage: pageIds.has(child.fullId) || nodeTargets.has(child),
        children,
      },
    ];
  });
}

function flattenPreviewMenuNodes(nodes: PreviewMenuNode[]): PreviewMenuNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenPreviewMenuNodes(node.children),
  ]);
}

// Each page the set opens is read as the viewer is served it and handed to
// the check — once per scope, then answered from the cache. A page whose
// layout cannot be read counts as kept: the preview never guesses a loss.
async function findPagesLosingInPreview(
  pages: PageInfo[],
  reading: PreviewMenuReading,
  check: PreviewPageLossCheck,
): Promise<Set<string>> {
  const { request, contexts, quickActions } = reading;
  const grants: PermissionPreviewGrants = {
    real: contexts.real.ungated.permissions,
    preview: request.previewPermissions,
  };
  const answers = previewLossCacheFor(check).pagesFor(
    previewCacheKey({
      tenantId: request.tenantId,
      userId: request.user._id,
      structureVersion: previewStructureVersion,
      real: grants.real,
      preview: grants.preview,
    }),
  );
  const pageReading: PreviewPageReading = {
    request: {
      ...request,
      ...memoizeViewerModels(request.memberModel, request.roleModel),
    },
    hiddenInPreview: false,
    quickActions,
    layouts: viewerLayoutsFor(request, contexts.real),
  };
  const losing = new Set<string>();
  await runInBatches(pages, PREVIEW_PAGE_CONCURRENCY, async (route) => {
    let answer = answers.get(route.fullId);
    if (!answer) {
      const handler = GetPageLayoutBySlug(route.fullSlug);
      answer = handler
        ? readPreviewPage(route, handler, pageReading)
            .then((page) => check(page, grants))
            .catch(() => false)
        : Promise.resolve(false);
      answers.set(route.fullId, answer);
    }
    if (await answer) losing.add(route.fullId);
  });
  return losing;
}

// Pages drawn in the menu, and the pages dynamic entries lead to (often kept
// out of the menu themselves) — never one the set is refused.
function listPreviewLossTargets(
  nodes: PreviewMenuNode[],
  reading: PreviewMenuReading,
  pagesByFullId: Map<string, PageInfo>,
): { pages: PageInfo[]; entryTargets: Map<string, string> } {
  const { served, denied } = reading;
  const pages = new Map<string, PageInfo>();
  const entryTargets = new Map<string, string>();
  for (const node of flattenPreviewMenuNodes(nodes)) {
    const page = pagesByFullId.get(node.fullId);
    if (page && !denied.has(page.fullId)) pages.set(page.fullId, page);
  }
  for (const node of [...served.values()].flat()) {
    const target = nodeTargets.get(node);
    if (!target || denied.has(node.fullId) || denied.has(target.fullId)) {
      continue;
    }
    pages.set(target.fullId, target);
    entryTargets.set(node.fullId, target.fullId);
  }
  return { pages: [...pages.values()], entryTargets };
}

// The menu entries the set opens without all the viewer has there, and the
// groups it can open none of.
async function aggregatePreviewMenuStates(
  reading: PreviewMenuReading,
): Promise<PreviewMenuStates> {
  const { request, contexts, served, denied } = reading;
  const tree = await addAccessToTree(
    navigationTree,
    contexts.real,
    true,
    served,
  );
  const pagesByFullId = new Map(
    Object.values(pagesBySlug).map((page) => [page.fullId, page]),
  );
  const nodes = collectPreviewMenuNodes(tree, new Set(pagesByFullId.keys()));
  const losesInside = new Set<string>();
  if (request.pageLoses) {
    const { pages, entryTargets } = listPreviewLossTargets(
      nodes,
      reading,
      pagesByFullId,
    );
    const losing = await findPagesLosingInPreview(
      pages,
      reading,
      request.pageLoses,
    );
    for (const fullId of losing) losesInside.add(fullId);
    for (const [entry, target] of entryTargets) {
      if (losing.has(target)) losesInside.add(entry);
    }
  }
  return aggregatePreviewMenu(
    nodes,
    denied,
    losesInside,
    await findUniversalPreviewPages(pagesByFullId, contexts.real),
  );
}

// The pages a set holding nothing still opens (`defaultGranted`): no role
// changes them, so the preview judges them on their own page only.
async function findUniversalPreviewPages(
  pagesByFullId: Map<string, PageInfo>,
  real: RequestAccessContext,
): Promise<Set<string>> {
  const empty = buildPreviewAccessContext(new Set(), real);
  const universal = new Set<string>();
  for (const [fullId, page] of pagesByFullId) {
    if (await computeEntryAccess(page, empty)) universal.add(fullId);
  }
  return universal;
}

/**
 * Read the menu and a page as a permission set would see them, without ever
 * leaving the viewer's own access: only entries the viewer reaches are
 * compared, and the page layouts are the ones the viewer is served — read on
 * the server, never sent. Nothing about the session changes — this is how the
 * roles editor previews a role.
 *
 * Dynamic menu entries are compared by running their providers for the viewer
 * under both sets.
 */
export async function resolvePermissionPreviewAccess(
  request: PermissionPreviewRequest,
): Promise<PermissionPreviewAccess> {
  const { path, user, memberModel, roleModel, tenantId } = request;
  const real = await buildAccessContext(user, memberModel, roleModel, tenantId);
  const preview = buildPreviewAccessContext(request.previewPermissions, real);
  const contexts = { real, preview };
  const [realQuickActions, previewQuickActions, served, previewed] =
    await Promise.all([
      getQuickActionsForUser((target) =>
        resolveQuickActionTarget(target, real),
      ),
      getQuickActionsForUser((target) =>
        resolveQuickActionTarget(target, preview),
      ),
      resolveDynamicChildren(user, tenantId, real),
      resolveDynamicChildren(user, tenantId, preview),
    ]);
  const quickActions = { real: realQuickActions, preview: previewQuickActions };
  const [registeredHidden, page] = await Promise.all([
    findRegisteredEntriesHiddenByPreview(real, preview),
    path
      ? resolvePreviewPage(path, request, contexts, quickActions)
      : Promise.resolve(null),
  ]);
  const denied = new Set([
    ...registeredHidden,
    ...findDynamicEntriesHiddenByPreview(served, previewed),
  ]);
  const states = await aggregatePreviewMenuStates({
    request,
    contexts,
    quickActions,
    served,
    denied,
  });
  return {
    hiddenEntries: states.hidden,
    partialEntries: states.partial,
    hiddenQuickActions: findQuickActionsHiddenByPreview(
      realQuickActions,
      previewQuickActions,
    ),
    page,
  };
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
    | "layoutUrl"
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
  banners: Promise<LayoutBannerSerialized[]>,
): Promise<SiteLayoutWithAccess> {
  return {
    pages: await annotateRegistryAccess(pagesBySlug, context),
    categories: await annotateRegistryAccess(
      buildNavigableCategoryIndex(),
      context,
    ),
    banners: await banners,
  };
}

// Banners are chrome, not product surfaces: they read the permissions the gate
// would hide, since telling a denied tenant why is what they are for. A copy,
// because the same set still decides every access check of this request.
function buildLayoutBannerContext(
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

export async function buildSiteLayoutPayload(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
  requestContext?: RequestContext,
): Promise<SiteLayoutPayload> {
  const accessContext = await buildAccessContext(
    user,
    memberModel,
    roleModel,
    tenantId,
  );

  // Started before the menu providers so both sets of resolvers run together;
  // it never rejects, so it cannot surface as an unhandled rejection meanwhile.
  const banners = resolveLayoutBanners(
    buildLayoutBannerContext(user, tenantId, accessContext),
  );
  const dynamicChildren = await resolveDynamicChildren(
    user,
    tenantId,
    accessContext,
  );

  const siteLayout = await annotateSiteLayoutAccess(accessContext, banners);
  const navBadges = await resolveMenuNavBadges(
    requestContext,
    user,
    Object.values(siteLayout.pages),
  );

  return {
    siteLayout: {
      ...siteLayout,
      pages: Object.fromEntries(
        Object.entries(siteLayout.pages).map(([slug, page]) => [
          slug,
          withNavBadge(page, navBadges),
        ]),
      ),
    },
    siteLayoutTree: withTreeNavBadges(
      await addAccessToTree(
        navigationTree,
        accessContext,
        true,
        dynamicChildren,
      ),
      navBadges,
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
  const isGranted = isRoot ? true : await computeEntryAccess(node, context);

  const childrenWithAccess = await buildChildrenWithAccess(
    node,
    context,
    dynamic,
  );

  // Redacted like the flat registries: an unreachable branch keeps its shape
  // so its accessible descendants stay addressable, but stops carrying what
  // it is called and what it holds.
  const visible = isGranted ? node : redactPresentation(node);

  const dynamicChildren = dynamic.get(node.fullId);
  const children = dynamicChildren
    ? mergeDynamicChildren(node.fullId, childrenWithAccess, dynamicChildren)
    : childrenWithAccess;
  const hasAccess =
    isGranted &&
    (isRoot ||
      (leadsSomewhere(node, children) &&
        !(await hidesEveryBlock(node, context))));
  if (!dynamicChildren && !holdsContainerWithoutEntry(node)) {
    return { ...visible, hasAccess, children };
  }
  return {
    ...visible,
    hasAccess,
    children,
    childrenOrders: sortChildIdsByOrder(children),
  };
}

// A group opens no page of its own: granted, but with none of its entries
// reachable, the menu would draw an entry that a click does nothing on. The
// permission preview locks such a group (`aggregatePreviewMenu`); the member
// it previews is not served it either. Its name stays, since it was granted.
function leadsSomewhere(
  node: SiteLayoutTree,
  children: Record<string, SiteLayoutTree>,
): boolean {
  return !!node.layoutUrl || Object.values(children).some(reachesPage);
}

// An entry left out of the menu still leads to the pages nested under it that
// keep their own entries.
function reachesPage(node: SiteLayoutTree): boolean {
  return (
    node.hasAccess !== false || Object.values(node.children).some(reachesPage)
  );
}

// A page showing the caller none of the blocks it declares is no menu entry:
// it would only open on "nothing to show for you" (`allComponentsHidden`).
// It stays reachable by its URL, and the pages nested under it keep their own
// entries. A page declaring no block (a module page rendering its own
// content) is never left out this way.
async function hidesEveryBlock(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  if (!entry.layoutUrl) return false;
  const effective = selectEntryContext(entry, context);
  if (effective.isOwner) return false;
  const page = pageMetadataByFullId.get(entry.fullId);
  return (await page?.HidesEveryComponent(effective.permissions)) ?? false;
}

// Whether the menu draws an entry: one the caller may open, and that shows
// them something. The permission preview locks what the set would not list.
async function listsEntry(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  if (!(await computeEntryAccess(entry, context))) return false;
  return !(await hidesEveryBlock(entry, context));
}

// The container `addToTree` creates for a missing category, or the one
// `removeFromTree` blanks: it stands for no registered entry, so it has nothing
// to show and no permission of its own.
function isContainerWithoutEntry(node: SiteLayoutTree): boolean {
  return node.fullId === "";
}

function holdsContainerWithoutEntry(node: SiteLayoutTree): boolean {
  return Object.values(node.children).some(isContainerWithoutEntry);
}

// A container without an entry is transparent in the client tree: what it
// holds joins its parent's children, each with its own access, rather than
// showing up as a "none" item that no permission ever grants. Registered
// siblings are placed first so that on a clash they keep their place.
async function buildChildrenWithAccess(
  node: SiteLayoutTree,
  context: RequestAccessContext,
  dynamic: DynamicChildren,
): Promise<Record<string, SiteLayoutTree>> {
  const children: Record<string, SiteLayoutTree> = {};
  const hoisted: Array<[string, SiteLayoutTree]> = [];
  for (const [key, child] of Object.entries(node.children)) {
    if (isContainerWithoutEntry(child)) {
      const held = await buildChildrenWithAccess(child, context, dynamic);
      hoisted.push(...Object.entries(held));
      continue;
    }
    children[key] = await addAccessToTree(child, context, false, dynamic);
  }
  for (const [key, entry] of hoisted) {
    if (children[key]) {
      warnHoistedCollision(entry, children[key]);
      continue;
    }
    children[key] = entry;
  }
  return children;
}

function warnHoistedCollision(
  hoisted: SiteLayoutTree,
  existing: SiteLayoutTree,
): void {
  const source = findNavigationEntryByFullId(hoisted.fullId);
  if (!source) return;
  warnOnceFor(
    source,
    "hoisted-collision",
    `[dms] "${hoisted.fullId}" hangs under an unregistered category and collides with "${existing.fullId}" at its parent's level: it was left out of the menu.`,
  );
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

async function runDynamicMenuResolver(
  provider: DynamicMenuProviderInfo,
  user: User | undefined,
  tenantId: string,
  permissions: Set<string>,
): Promise<DynamicMenuItem[]> {
  try {
    return await withResolverTimeout(
      Promise.resolve(provider.resolver(user, tenantId, permissions)),
      `category "${provider.categoryFullId}"`,
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
    nodeTargets.set(node, target);
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

/** A quick action's page, resolved and admitted for the caller. */
interface QuickActionPage {
  pageInfo: PageInfo;
  meta: PageMetadata;
  context: RequestAccessContext;
}

type QuickActionTargetOf<K extends QuickActionTarget["type"]> = Extract<
  QuickActionTarget,
  { type: K }
>;

type QuickActionTargetHandler<K extends QuickActionTarget["type"]> = (
  target: QuickActionTargetOf<K>,
  page: QuickActionPage,
) => Promise<QuickActionTargetSerialized | undefined>;

type QuickActionTargetHandlers = {
  [K in QuickActionTarget["type"]]: QuickActionTargetHandler<K>;
};

const quickActionTargetHandlers: QuickActionTargetHandlers = {
  event: async (target) => ({
    type: "event",
    name: target.name,
    payload: target.payload,
  }),
  navigate: async (target, { pageInfo }) => ({
    type: "navigate",
    to: pageInfo.fullSlug,
    query: target.query,
  }),
  openForm: resolveOpenFormTarget,
  button: resolveButtonTarget,
};

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

  // The map is keyed by the target's own discriminant, so the handler picked
  // always matches it; the compiler cannot correlate the two lookups.
  const handler = quickActionTargetHandlers[
    target.type
  ] as QuickActionTargetHandler<QuickActionTarget["type"]>;
  return handler(target, { pageInfo, meta, context });
}

// Read under the same context the page itself was judged with, or a recovery
// page's own form would be dropped by the emptied set the gate hands ordinary
// surfaces.
function holdsPagePermission(
  page: QuickActionPage,
  permissionId: string,
): Promise<boolean> {
  return HasPermission(
    selectEntryContext(page.pageInfo, page.context).permissions,
    permissionId,
  );
}

// Opening a creation form takes more than reaching the page: the component's
// own `add` permission decides, so the action never offers a form its target
// would refuse to submit. Derived from the component itself — the caller names
// no permission and none can go stale.
async function resolveOpenFormTarget(
  target: QuickActionTargetOf<"openForm">,
  page: QuickActionPage,
): Promise<QuickActionTargetSerialized | undefined> {
  const resolved = resolveQuickActionComponent(page.meta, target, {
    accepts: (component) => component.getAction("add") !== undefined,
    description: "can create a row",
  });
  if (!resolved) return undefined;
  const [componentKey, component] = resolved;
  const addPermission = component.getAction("add")?.permissionId;
  if (addPermission && !(await holdsPagePermission(page, addPermission))) {
    return undefined;
  }
  return {
    type: "openForm",
    to: page.pageInfo.fullSlug,
    component: componentKey,
  };
}

// The action presses an existing button, so it is listed for exactly the
// callers the button is shown to: the button's own permission decides, resolved
// the way the table view resolves it when it filters its buttons.
async function resolveButtonTarget(
  target: QuickActionTargetOf<"button">,
  page: QuickActionPage,
): Promise<QuickActionTargetSerialized | undefined> {
  const resolved = resolveQuickActionComponent(page.meta, target, {
    accepts: (component) => component.getButton(target.button) !== undefined,
    description: `declare button "${target.button}"`,
  });
  if (!resolved) return undefined;
  const [componentKey, component] = resolved;
  const button = component.getButton(target.button);
  if (!button) {
    warnOnceFor(
      target,
      "unknown-button",
      `[DMS] Quick action presses button "${target.button}", which the targeted component of page "${page.meta.pageInfo?.fullId}" does not declare: the action is not served.`,
    );
    return undefined;
  }
  if (!(await holdsButtonPermission(page, component, button))) {
    return undefined;
  }
  return {
    type: "button",
    to: page.pageInfo.fullSlug,
    component: componentKey,
    button: button.id,
  };
}

async function holdsButtonPermission(
  page: QuickActionPage,
  component: Component,
  button: ComponentButton,
): Promise<boolean> {
  if (!isPermissionGated(button)) return true;
  const permissionId =
    button.permissionId ??
    (button.permission === undefined
      ? undefined
      : component.resolveButtonPermissionId(button.permission));
  return (
    permissionId !== undefined &&
    (await holdsPagePermission(page, permissionId))
  );
}

/** Which of a page's components can answer a quick action. */
interface QuickActionComponentFilter {
  accepts: (component: Component) => boolean;
  /** What an answering component does, for the ambiguity warning. */
  description: string;
}

/**
 * The component a quick action addresses, and the key the browser addresses
 * it by.
 *
 * Always resolved here rather than left to the client: several table views can
 * share a page, and an unnamed target would have every one of them answer at
 * once. Naming the component object — not a string — is what keeps a renamed
 * or moved component from leaving a dangling reference behind.
 */
function resolveQuickActionComponent(
  meta: PageMetadata,
  target: QuickActionTargetOf<"openForm" | "button">,
  filter: QuickActionComponentFilter,
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

  const candidates = entries.filter(([, candidate]) =>
    filter.accepts(candidate),
  );
  if (candidates.length === 1) return candidates[0];
  warnOnceFor(
    target,
    "ambiguous-component",
    `[DMS] Quick action targets page "${meta.pageInfo?.fullId}", which mounts ${candidates.length} components that ${filter.description}: name the one it means. The action is not served.`,
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
    const presented = presentModuleInfo(info);
    result[moduleId] = hasAccess
      ? { ...presented, hasAccess }
      : {
          ...presented,
          title: "",
          description: "",
          icon: "",
          version: undefined,
          catalogCategory: undefined,
          hasAccess,
        };
  }
  return result;
}

/** A module's catalog tile: its static info plus what its hooks reported. */
type ModuleCatalogEntry = Omit<ModuleInfo, "status" | "readout"> & {
  hasAccess: boolean;
  landingSlug: string;
  status: ModuleStatus;
  readout: ModuleReadoutLine[];
};

const DEFAULT_MODULE_STATUS: ModuleStatus = "live";
const MODULE_STATUSES = new Set<string>([
  "live",
  "beta",
  "update",
  "attention",
]);
const MODULE_READOUT_TONES = new Set<string>([
  "success",
  "info",
  "warning",
  "error",
]);
// A tile has room for a couple of lines; more would push the title off it.
const MODULE_READOUT_MAX_LINES = 3;

/**
 * The module's info without its catalog hooks: functions have no place in a
 * response payload.
 */
function presentModuleInfo(
  info: ModuleInfo,
): Omit<ModuleInfo, "status" | "readout"> {
  const { status: _status, readout: _readout, ...presented } = info;
  return presented;
}

async function runModuleStatusHook(
  info: ModuleInfo,
  context: ModuleCatalogContext,
): Promise<ModuleStatus> {
  if (!info.status) return DEFAULT_MODULE_STATUS;
  try {
    const status = await withResolverTimeout(
      Promise.resolve(info.status(context)),
      `status of module "${info.id}"`,
    );
    if (typeof status === "string" && MODULE_STATUSES.has(status)) {
      return status;
    }
    warnOnceFor(
      info,
      "status-invalid",
      `[dms] module "${info.id}" status() returned ${JSON.stringify(status)}; expected one of ${[...MODULE_STATUSES].join(", ")}.`,
    );
  } catch (error) {
    warnOnceFor(
      info,
      "status-failed",
      `[dms] module "${info.id}" status() failed: ${String(error)}`,
    );
  }
  return DEFAULT_MODULE_STATUS;
}

async function runModuleReadoutHook(
  info: ModuleInfo,
  context: ModuleCatalogContext,
): Promise<ModuleReadoutLine[]> {
  if (!info.readout) return [];
  try {
    const lines = await withResolverTimeout(
      Promise.resolve(info.readout(context)),
      `readout of module "${info.id}"`,
    );
    if (!Array.isArray(lines)) return [];
    return lines
      .filter(
        (line): line is ModuleReadoutLine =>
          !!line && typeof line.text === "string" && line.text.length > 0,
      )
      .slice(0, MODULE_READOUT_MAX_LINES)
      .map((line) => {
        const tone = line.tone;
        return {
          text: line.text,
          tone:
            tone && MODULE_READOUT_TONES.has(tone)
              ? tone
              : ("info" as ModuleReadoutTone),
        };
      });
  } catch (error) {
    warnOnceFor(
      info,
      "readout-failed",
      `[dms] module "${info.id}" readout() failed: ${String(error)}`,
    );
    return [];
  }
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
