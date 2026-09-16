import type { ControllerClass } from "@antelopejs/interface-api";
import type { User } from "../auth/db";
import type {
  Action,
  Component,
  ComponentInfo,
  ComponentInfoSerialized,
  PlacementSide,
} from "../component";
import type { RoleModel, TenantMemberModel } from "../db";
import type { Permission } from "../permissions";
import type { MaybePromise } from "../types";

export type { MaybePromise };

export type MenuItemType = "label" | "link";

/**
 * Semantic look of a menu entry. `accent` renders the entry in the theme's
 * primary color, for call-to-action entries such as "New project".
 */
export type MenuItemVariant = "default" | "accent";

/**
 * Semantic state dot rendered at the end of a menu entry. Maps to the theme's
 * semantic colors, so a consumer never ships raw classes.
 */
export type MenuItemStatus = "success" | "warning" | "error" | "neutral";

/** Query parameters appended to a menu entry's link. */
export type MenuItemQuery = Record<string, string>;

/** Values for the `:name` segments of the page slug a menu entry links to. */
export type MenuItemParams = Record<string, string>;

/** Cleanup callback returned by a PageSetupFunction. Called on page unmount. */
export type PageSetupCleanup = () => void;

/**
 * Context passed to a PageSetupFunction. Use on(component, event, handler)
 * to subscribe (returns an unsubscribe). Use emit(component, event, data) to
 * dispatch on the shared window event bus.
 */
export interface PageSetupContext {
  pageInfo: PageInfo;
  permissions: Set<string>;
  on(
    component: string,
    event: string,
    handler: (data: unknown) => void,
  ): () => void;
  emit(component: string, event: string, data?: unknown): void;
}

/**
 * Page-level setup function referenced by MenuOptions.setupId. Registered on
 * the frontend via useDefinedFunctions().registerFunction(). Runs in
 * onMounted; cleanup runs on onUnmounted.
 *
 * Returns `void` rather than `undefined`, which lets callers omit a return
 * statement entirely.
 */
export type PageSetupFunction = (
  context: PageSetupContext,
) => MaybePromise<PageSetupCleanup | void>;

export interface PageValidation {
  requiredQueryParams?: string[];
  customFunctionId?: string;
}

export const MODULE_URL_PREFIX = "/modules";

export const ROOT_SLUG = "/";

export interface ModuleInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  landingPage?: string;
  /**
   * Optional category that groups the module's "loose" pages (pages declared
   * with `module` but no explicit `category`) under a real, controllable
   * heading instead of the default "Pages" label. When omitted, loose pages
   * fall back to the generic "Pages" grouping.
   */
  defaultCategory?: {
    displayName?: string;
    icon?: string;
    order?: number;
    urlSlug?: string;
  };
}

export interface MenuOptions {
  displayName: string;
  category?: CategoryInfo | ControllerClass;
  module?: string;
  urlSlug?: string;
  description?: string;
  order?: number;
  icon?: string;
  hidden?: boolean;
  permission?: Partial<Permission> | Action;
  publicAccess?: boolean;
  authOnly?: boolean;
  type?: MenuItemType;
  validation?: PageValidation;
  setupId?: string;
  noComponentPermissions?: boolean;
  /**
   * Query parameters carried by the entry's menu link, so a single page with
   * `validation.requiredQueryParams` can serve many entries
   * (e.g. `/project?project=<id>`).
   */
  query?: MenuItemQuery;
  variant?: MenuItemVariant;
  status?: MenuItemStatus;
  /**
   * Keep the page reachable while a tenant access gate denies the tenant, the
   * page-level mirror of the `bypassTenantAccessGate` guard option. Covers page
   * visibility, menu visibility and the page's own layout route. Permission
   * checks still apply normally — unlike `authOnly`, which drops them entirely.
   *
   * Inherited by the pages of a flagged category. The data routes feeding the
   * page are not covered: a data API is not owned by a single page, so it opts
   * out explicitly through its own guard's `bypassTenantAccessGate` option.
   *
   * Reserved for recovery surfaces (billing, payment portal) a blocked tenant
   * must still reach.
   */
  bypassTenantAccessGate?: boolean;
}

export interface CategoryInfo extends Omit<MenuOptions, "category"> {
  id: string;
  fullId: string;
  fullSlug: string;
  category: CategoryInfo | ControllerClass | undefined;
  isModuleRoot?: boolean;
  /**
   * Whether the category adds no segment of its own to the URL, because its
   * `fullSlug` is its parent's — what `urlSlug: "/"` produces. Such a category
   * is a section heading, not a route: it cannot be addressed on its own, and
   * any number of them may sit under one parent.
   *
   * Derived at declaration time, never declared: `MenuOptions` has no matching
   * field, and passing one would be ignored.
   */
  urlTransparent?: boolean;
}

export interface PageInfo extends CategoryInfo {
  layoutUrl: string;
}

/**
 * A menu entry produced by a dynamic menu provider. It is not a page: it links
 * to an already registered page (`fullSlug`), optionally narrowed by `params`
 * and `query`, so one page can back any number of entries.
 */
export interface DynamicMenuItem {
  /**
   * Unique within the provider's category; becomes the entry's `fullId` suffix.
   * Dots separate the levels of a `fullId`, so an id may not contain one — an
   * entry that does is skipped with a warning.
   */
  id: string;
  displayName: string;
  /**
   * Full slug of the registered page the entry links to. The entry is listed
   * only when the caller can access that page, so an entry never offers a link
   * its target would refuse.
   */
  fullSlug: string;
  /**
   * Values for the `:name` segments of `fullSlug`, URL-encoded into the entry's
   * link. They must fill every segment and nothing else: an entry that leaves a
   * segment unfilled, or names a parameter the slug does not have, is skipped
   * with a warning.
   */
  params?: MenuItemParams;
  query?: MenuItemQuery;
  description?: string;
  icon?: string;
  order?: number;
  variant?: MenuItemVariant;
  status?: MenuItemStatus;
  /**
   * Permission required to see the entry, as a raw id — unlike `MenuOptions`,
   * which takes a whole permission or an `Action`. Unset means always visible.
   *
   * It is matched against the permission set the caller's browser actually
   * receives, the way the browser matches it — the wildcard or a literal grant,
   * never a `defaultGranted` fallback — so the sidebar never offers an entry
   * whose controls would be inert. While a tenant access gate denies the
   * tenant, that set only holds the surfaces flagged `bypassTenantAccessGate`,
   * so a recovery entry declares its permission under its target page, as in
   * `<recoveryPageFullId>.settle`.
   */
  permissionId?: string;
}

/**
 * Resolves the dynamic entries of a category for one request. `permissions` is
 * the caller's effective permission set as the parent category sees it: empty
 * when a tenant access gate denies the tenant, unless the category is flagged
 * `bypassTenantAccessGate`, in which case the real permissions are kept.
 * `user` is undefined for an unauthenticated request.
 */
export type DynamicMenuResolver = (
  user: User | undefined,
  tenantId: string,
  permissions: Set<string>,
) => MaybePromise<DynamicMenuItem[]>;

export interface DynamicMenuProviderInfo {
  categoryFullId: string;
  resolver: DynamicMenuResolver;
}

/**
 * One component a page extension contributes to its target page. `key` is the
 * static field name it was declared under, and also the last segment of its
 * permission id on the target page.
 */
export interface PageExtensionComponent {
  key: string;
  component: Component;
  side: PlacementSide;
  anchorPath?: readonly string[];
  order: number;
}

/**
 * Everything one `@RegisterPageExtension` class contributes to one target page.
 * The object itself is the registration handle: it is what gets unregistered
 * when the extending module stops.
 */
export interface PageExtensionInfo {
  extensionName: string;
  targetFullId: string;
  components: PageExtensionComponent[];
}

export interface PageLayout<T = unknown> {
  components: Record<string, ComponentInfoSerialized<T>>;
  layout?: ComponentInfo<T>;
}

export type PageLayoutHandler = (
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
) => Promise<PageLayout>;
