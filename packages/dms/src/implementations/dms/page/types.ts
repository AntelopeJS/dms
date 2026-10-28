import {
  type PageInfo,
  type CategoryInfo,
  type ModuleInfo,
  type PageLayout,
  PageMetadata,
  type ModuleStatus,
  type ModuleReadoutLine,
} from "@antelopejs/interface-dms/page";
import type { WithCategoryRef, TreeWithCategoryRefs } from "../menu-categories";
import type { LayoutBannerSerialized } from "../layout-banners";
import type {
  QuickActionsPayload,
  QuickActionTargetSerialized,
} from "../quick-actions";
import type { ResolvedNavBadges } from "@antelopejs/interface-dms/page/internal/nav-badges";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { TenantMemberModel, RoleModel } from "@antelopejs/interface-dms/db";
import type { RequestContext } from "@antelopejs/interface-api";
import type { ServedQuickActions } from "../permission-preview";
import type { QuickActionTarget } from "@antelopejs/interface-dms/quick-actions";
import type { Component } from "@antelopejs/interface-dms/component";

export type SiteLayoutTree = Omit<PageInfo, "layoutUrl"> & {
  children: Record<string, SiteLayoutTree>;
  childrenOrders: string[];
  layoutUrl?: string;
  hasAccess?: boolean;
};

export interface AccessContext {
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
export interface RequestAccessContext {
  gated: AccessContext;
  ungated: AccessContext;
  client: AccessContext;
  gateDenied: boolean;
  entryAccess: Map<string, Promise<boolean>>;
}

export interface AccessFlag {
  hasAccess: boolean;
}

/** A page of the site layout: its category named by id. */
export type ServedPage = WithCategoryRef<PageInfo & AccessFlag>;

export interface SiteLayoutWithAccess {
  /** By slug, the key a URL is resolved against. */
  pages: Record<string, ServedPage>;
  /**
   * Every category, once, by full id: the pages and categories name theirs
   * by id (`categoryId`). A browser resolves a URL against the ones that are
   * not `urlTransparent`, by `fullSlug`.
   */
  categories: Record<string, WithCategoryRef<CategoryInfo & AccessFlag>>;
  /**
   * Carried inside the site layout rather than beside it: every renderer
   * already hydrates this object from a page's shared payload, so the banners
   * reach the server-rendered page with no renderer change.
   */
  banners: LayoutBannerSerialized[];
}

export interface SiteLayoutPayload {
  siteLayout: SiteLayoutWithAccess;
  siteLayoutTree: TreeWithCategoryRefs<SiteLayoutTree>;
  quickActions: QuickActionsPayload;
  modules: Record<string, ModuleInfo & AccessFlag>;
  isOwner: boolean;
}

export interface PagePayload {
  route: ServedPage;
  shared: SiteLayoutPayload;
  layout: PageLayout;
  /**
   * The counted navigation badges of the pages the caller can open, by page
   * full id: computed on each visit, never part of the site layout a browser
   * keeps for minutes.
   */
  navBadges: ResolvedNavBadges;
}

export interface PageResponsePayload extends Omit<PagePayload, "shared"> {
  shared?: SiteLayoutPayload;
}

export type SharedPagePayloadArguments = [
  slug: string,
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
];

export type PageResponsePayloadArguments = [
  ...SharedPagePayloadArguments,
  includeShared: boolean,
  requestContext?: RequestContext,
];

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

export type ViewerModelResult =
  | Awaited<ReturnType<TenantMemberModel["getByUser"]>>
  | Awaited<ReturnType<RoleModel["getBy"]>>;

/** How one page of a preview is read, besides the page itself. */
export interface PreviewPageReading {
  request: PermissionPreviewRequest;
  hiddenInPreview: boolean;
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions };
  /** The viewer's layouts of this scope, by page `fullId`. */
  layouts: Map<string, Promise<PageLayout>>;
}

export interface PreviewMenuReading {
  request: PermissionPreviewRequest;
  contexts: { real: RequestAccessContext; preview: RequestAccessContext };
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions };
  served: DynamicChildren;
  denied: Set<string>;
}

export interface NavigationEntry extends Partial<
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

export type DynamicChildren = Map<string, SiteLayoutTree[]>;

export interface ResolvedEntryTarget {
  target: PageInfo;
  link: string;
}

/** A quick action's page, resolved and admitted for the caller. */
export interface QuickActionPage {
  pageInfo: PageInfo;
  meta: PageMetadata;
  context: RequestAccessContext;
}

export type QuickActionTargetOf<K extends QuickActionTarget["type"]> = Extract<
  QuickActionTarget,
  { type: K }
>;

export type QuickActionTargetHandler<K extends QuickActionTarget["type"]> = (
  target: QuickActionTargetOf<K>,
  page: QuickActionPage,
) => Promise<QuickActionTargetSerialized | undefined>;

export type QuickActionTargetHandlers = {
  [K in QuickActionTarget["type"]]: QuickActionTargetHandler<K>;
};

/** Which of a page's components can answer a quick action. */
export interface QuickActionComponentFilter {
  accepts: (component: Component) => boolean;
  /** What an answering component does, for the ambiguity warning. */
  description: string;
}

/** A module's catalog tile: its static info plus what its hooks reported. */
export type ModuleCatalogEntry = Omit<ModuleInfo, "status" | "readout"> & {
  hasAccess: boolean;
  landingSlug: string;
  status: ModuleStatus;
  readout: ModuleReadoutLine[];
};
