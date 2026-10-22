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
import type { PermissionsResolverContext } from "../permissions-resolver";
import type { Tone } from "../base/types/tone";
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
  /** Query parameters the page needs, each with a non-empty value. */
  requiredQueryParams?: string[];
  /** Id of a validation function the frontend registers. */
  customFunctionId?: string;
  /**
   * Where a page that fails its validation sends the user, in place of the
   * "Page not found" error: a dashboard path, such as the list a detail page
   * opened without its `?id` belongs to. The history entry is replaced, so
   * Back does not return to the invalid URL, and a server render answers a
   * redirect. It may name the page URL with `{{params.X}}` and `{{query.X}}`
   * tokens; a query pair whose token has no value is left out.
   */
  redirectTo?: string;
}

export const MODULE_URL_PREFIX = "/modules";

/**
 * State a module reports on the modules catalog, rendered as a pill on its
 * tile: `live` (working normally, the default), `beta` (usable, still
 * changing), `update` (a newer version is available) or `attention`
 * (something needs a platform owner, such as a failing job).
 */
export type ModuleStatus = "live" | "beta" | "update" | "attention";

/**
 * Tone of one readout line: `success` (healthy figure), `info` (neutral
 * fact), `warning` (worth a look) or `error` (something is failing). The
 * former `ok` is still read as `success` in 0.4, with a warning.
 */
export type ModuleReadoutTone = Extract<
  Tone,
  "success" | "info" | "warning" | "error"
>;

/**
 * One short line of a module's live readout on the catalog
 * (`42 tables · 1.9 GB`). `text` may be an i18n key prefixed with `$`.
 */
export interface ModuleReadoutLine {
  text: string;
  tone?: ModuleReadoutTone;
}

/**
 * Request the catalog hooks of a module run for. The catalog is owner-only,
 * so `user` is a platform owner; `tenantId` is the tenant the request is
 * scoped to.
 */
export interface ModuleCatalogContext {
  user: User | undefined;
  tenantId: string;
}

export interface ModuleInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  landingPage?: string;
  /** Version shown on the catalog tile (`1.4.0`). */
  version?: string;
  /**
   * Catalog category the module is filed under (`Content`, `Developer`…).
   * May be an i18n key prefixed with `$`. Modules without one are grouped
   * under a generic "Other" category.
   */
  catalogCategory?: string;
  /**
   * Reports the module's current state on the catalog. Called on each catalog
   * load; a hook that throws or does not answer in time is ignored and the
   * module shows as `live`.
   */
  status?: (context: ModuleCatalogContext) => MaybePromise<ModuleStatus>;
  /**
   * Returns a few short lines (two read best) saying what the module is doing
   * right now. Called on each catalog load; a hook that throws or does not
   * answer in time is ignored and the tile shows no readout.
   */
  readout?: (
    context: ModuleCatalogContext,
  ) => MaybePromise<ModuleReadoutLine[]>;
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

/**
 * How an entry opens to every signed-in member without a role grant (see
 * `MenuOptions.memberAccess`): `true` for the entry and everything declared
 * under it, `"self"` for the entry alone.
 */
export type MemberAccess = boolean | "self";

/**
 * The Direct / Pause valve of a page's realtime (`MenuOptions.live`). It adds
 * no transport: blocks keep their `realtimeTopic` and tables their
 * `realtime`, and the page only decides when the events they receive turn
 * into requests.
 *
 * - **Direct** (the default): a block or table refetches on its events as
 *   usual, at most once per `maxRate` seconds. The last event of a burst is
 *   never lost: it refetches when the interval ends.
 * - **Pause**: nothing is requested on an event. Each block and table counts
 *   the events it receives, and resuming refetches once each one that missed
 *   any. A rolling period (`last-hour`, `last-24h`) stops sliding meanwhile,
 *   and a calendar period (`today`, `last-7-days`...) waits to move past
 *   midnight.
 *
 * What the user asks for always reads, paused or not: a page header button, a
 * form saved with `BlockFunctions.REFRESH_PAGE`, a table's row actions.
 *
 * The user switches with a `LiveToggle()` block, or the L key while one is on
 * the page; the choice is kept per page in the browser (per `rememberKey` when set),
 * and `?live=0` in the URL opens the page paused. The page also pauses by
 * itself while its browser tab is hidden, and while a component holds it
 * (`usePageLive().hold(reason)`); it resumes when that ends, unless the user
 * paused it. A table declared with `liveHold` keeps its rows while paused and
 * offers to show what is new.
 *
 * Paused, an event counts as the rows it names in `payload.ids` (each row once
 * per pause, as a table view's own row events do), else as `payload.count`
 * when it is a positive integer (a batch of N requests), else as one.
 *
 * While the realtime stream is down, a page with a `maxRate` reads its blocks
 * every `maxRate` seconds instead (`refreshLivePageBlocks()`), until it is back.
 */
export interface PageLiveOptions {
  /**
   * Shortest interval, in seconds, between two refetches of one block in
   * Direct, and the polling interval while the realtime stream is down.
   * Unset, a block refetches on each event, as without `live`, and the page
   * does not poll.
   */
  maxRate?: number;
  /**
   * A slower cadence while the page shows a long period: once the period of
   * its `PeriodSelector` spans `period` or more, `maxRate` gives way to this
   * one, for the gate and the polling alike. A week of data barely moves in 5 s.
   *
   * ```ts
   * live: { maxRate: 10, slowRateAfter: { period: "7d", maxRate: 60 } }
   * ```
   */
  slowRateAfter?: PageLiveSlowRate;
  /**
   * Shares the remembered Direct / Pause choice between the pages declaring
   * the same key, e.g. the pages of one module (`rememberKey: "api"`). Unset, each
   * page remembers its own.
   */
  rememberKey?: string;
}

/**
 * A length of time: a positive whole number of minutes, hours or days
 * (`"30m"`, `"24h"`, `"7d"`).
 */
export type PageLivePeriod = `${number}${"m" | "h" | "d"}`;

/** The slower cadence of a live page showing a long period. */
export interface PageLiveSlowRate {
  /** The shortest period the slower cadence applies to. */
  period: PageLivePeriod;
  /** Shortest interval, in seconds, between two refetches of one block. */
  maxRate: number;
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
  /**
   * Every signed-in member of the tenant reaches the entry, its components and
   * their actions without a role grant: their permissions are registered as
   * `defaultGranted`, so they never wait on a role and the role editor does not
   * list them. Guards, menus and table views keep checking them as usual — only
   * the grant is implied. Unlike `authOnly`, the tenant access gate still
   * applies and the permission ids still exist.
   *
   * `true` is inherited by everything declared under the entry, page or
   * category. `"self"` opens the entry alone: what is declared under it keeps
   * needing its own grant. The settings root is `"self"`, so every member opens
   * the settings overview while the workspace pages under it stay gated.
   * Meant for personal surfaces every member owns: their profile, security,
   * notifications and preferences.
   */
  memberAccess?: MemberAccess;
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
   * Short count or label rendered at the end of the menu entry (`3`, `new`).
   * Takes the trailing slot, so a leaf entry shows either a badge or a
   * status dot — the badge wins.
   */
  badge?: string;
  /**
   * Default layout of the entry and of every page and sub-category declared
   * under it that sets none of its own (`Category("billing", { category,
   * layout: SettingsLayout() })`). The nearest declaring ancestor wins; a
   * page's own layout argument always overrides it, and a page with neither
   * gets `DefaultLayout()`.
   */
  layout?: ComponentInfo;
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
  /**
   * Gives the page a Direct / Pause state over the realtime of its blocks
   * (see {@link PageLiveOptions}). A page without it refetches on every
   * event, as before. Read on pages only: a category ignores it.
   *
   * ```ts
   * export class RequestLogs extends PageController("logs", {
   *   displayName: "Request logs",
   *   module: "api",
   *   live: { maxRate: 5 },
   * }) {
   *   static liveToggle = LiveToggle();
   *   static table = TableView.fromSource({ ..., realtimeTopic: "api:requests", liveHold: true });
   * }
   * ```
   */
  live?: PageLiveOptions;
  /**
   * The page this one is a detail of, named by its controller: the
   * breadcrumb shows it before this page, so a hidden detail page
   * (`/operations/project/:id`) reads "Operations / Projects / <record>" and
   * leads back to its list. Its route parameters are filled from this page's
   * own when they share a name. Read on pages only: a category ignores it.
   *
   * ```ts
   * export class ProjectPage extends PageController("project", {
   *   displayName: "Project",
   *   category: operationsCategory,
   *   urlSlug: "project/:id",
   *   hidden: true,
   *   parent: ProjectsPage,
   * }) {}
   * ```
   */
  parent?: ControllerClass;
}

export interface CategoryInfo extends Omit<MenuOptions, "category" | "parent"> {
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
  /** Full slug of the page declared as `parent`, resolved at registration. */
  parentSlug?: string;
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
  /** Short count or label rendered at the end of the entry (`3`, `new`). */
  badge?: string;
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
  /**
   * Set when the page declares components and the caller may see none of
   * them, so the browser can say so rather than draw a blank page. A page
   * declaring no component at all never carries it.
   */
  allComponentsHidden?: true;
}

/** What a page layout is asked for: its caller, and the page URL it is drawn at. */
export interface PageLayoutRequest {
  user: User | undefined;
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
  tenantId: string;
  /** The query of the page URL, handed to header-button availability. */
  query?: Readonly<Record<string, string>>;
  /** The route parameters (`:id`) of the page URL, handed along with it. */
  params?: Readonly<Record<string, string>>;
  /**
   * What the permission resolvers are told about this read: `preview` when
   * the layout is served for a role previewed by `user`.
   */
  resolverContext?: PermissionsResolverContext;
}

export type PageLayoutHandler = (
  request: PageLayoutRequest,
) => Promise<PageLayout>;
