import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import {
  EventProxy,
  GetMetadata,
  InterfaceFunction,
} from "@antelopejs/interface-core";
import { MakeClassDecorator } from "@antelopejs/interface-core/decorators";
import { Logging } from "@antelopejs/interface-core/logging";
import { Component, type ComponentInfo, DEFAULT_PLACEMENT } from "../component";
import {
  assertHasCategoryOrModule,
  assertValidLiveOptions,
} from "./internal/controller-options";
import {
  applyModuleResolution,
  calculateFullSlug,
  createCategoryFunction,
  resolveCategoryInfo,
  RootCategory as createRootCategory,
  validateNotInsideSettings,
} from "./internal/categories";
import { internal } from "./categories";
import { PageMetadata } from "./metadata";
import { pageRoutePath } from "./page-routes";
import type {
  CategoryInfo,
  DynamicMenuProviderInfo,
  DynamicMenuResolver,
  MenuOptions,
  PageExtensionComponent,
  PageExtensionInfo,
} from "./types";
import { fireAndForget } from "../utils/fire-and-forget";

interface StaticComponentField {
  key: string;
  component: Component;
}

/**
 * Static component fields of a class, in declaration order. Underscore-prefixed
 * fields are skipped, so a class can keep private static state.
 */
// oxlint-disable-next-line anti-slop/no-object-parameters -- Decorated classes expose static component fields known only at runtime.
function collectStaticComponents(cl: object): StaticComponentField[] {
  const fields: StaticComponentField[] = [];
  for (const key of Object.getOwnPropertyNames(cl)) {
    if (key.startsWith("_")) continue;

    // oxlint-disable-next-line anti-slop/no-reflect-get -- The static field name comes from Object.getOwnPropertyNames; its value is narrowed with instanceof Component.
    const value: unknown = Reflect.get(cl, key);
    if (value instanceof Component) {
      fields.push({ key, component: value });
    }
  }
  return fields;
}

export const RegisterPage = MakeClassDecorator((cl) => {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The decorator accepts any class and trusts callers to apply it to a page controller; checking inheritance would change the published decorator's behavior.
  const meta = GetMetadata(cl as ControllerClass, PageMetadata);

  for (const { key, component } of collectStaticComponents(cl)) {
    meta.SetComponent(key, component);
  }

  fireAndForget(meta.Register(), "page registration");
});

function buildExtensionComponents(
  // oxlint-disable-next-line anti-slop/no-object-parameters -- Extension components are collected from the decorated class static fields at runtime.
  extensionClass: object,
): PageExtensionComponent[] {
  return collectStaticComponents(extensionClass).map(({ key, component }) => {
    const placement = component.placement ?? DEFAULT_PLACEMENT;
    const entry: PageExtensionComponent = {
      key,
      component,
      side: placement.side,
      order: placement.order,
    };
    if (placement.anchor) {
      entry.anchorPath = placement.anchor;
    }
    return entry;
  });
}

/**
 * Inject components into a page owned by another module. The decorated class is
 * not a page: every static component field on it becomes a component of the
 * target page, keyed by its field name, and therefore permissioned as
 * `<target page id>.<field name>` in that page's own permission tree — exactly
 * like a component the page declares itself.
 *
 * The target is named by its page id, never imported: an extending module
 * depends on `@antelopejs/interface-dms` alone, and stays out of the target
 * module's registrations. A page id is the dotted path of its categories
 * followed by its own id — it is also the page's permission id, the one listed
 * in the roles screen and returned by `GetPermissionId(ThePageClass)` inside
 * the owning module. The DMS members page, for instance, is
 * `settings.workspace.members`.
 *
 * Placement is declared on each component with `.before(anchor)` /
 * `.after(anchor)`, where an anchor is a static field name of the target page
 * (`"table"`) or the dotted path to a nested position (`"content.tasks"`).
 * Without one, the component is appended after the page's own components. When
 * several components land at the same spot, `.order(n)` decides, and equal
 * orders fall back to the extension class name then to declaration order —
 * never to module start order.
 *
 * The injection applies as soon as the target page has finished registering —
 * it is held until then whichever module starts first, and stays held, with a
 * warning once the project has started, for a page id no module registers — and
 * is removed when the extending module stops. Anchors and field names are
 * checked against the target page when the injection applies: a field name the
 * page or another extension already uses, or an anchor the page does not
 * declare, is reported and the extension is skipped.
 *
 * ```ts
 * @RegisterPageExtension("settings.workspace.members")
 * export class SeatQuotaExtension {
 *   static seatQuota = CustomComponent("SeatQuotaBanner")
 *     .meta({ name: "Seat quota" })
 *     .before("table");
 * }
 * ```
 *
 * @param targetPageId Full id of the page to extend.
 */
export const RegisterPageExtension = MakeClassDecorator(
  (cl, targetPageId: string) => {
    const extensionName = cl.name || "anonymous page extension";
    if (!targetPageId.trim()) {
      throw new Error(
        `Page extension "${extensionName}" must name the page it extends by its full id, for example "settings.workspace.members".`,
      );
    }

    const components = buildExtensionComponents(cl);
    if (components.length === 0) {
      Logging.Warn(
        `[dms] page extension "${extensionName}" declares no component field — nothing is injected into page "${targetPageId}".`,
      );
      return;
    }

    const info: PageExtensionInfo = {
      extensionName,
      targetFullId: targetPageId,
      components,
    };
    internal.RegisterPageExtension.register(info);
  },
);

export function Category(id: string, options: MenuOptions): CategoryInfo {
  assertHasCategoryOrModule(id, options, "Category");
  return createCategoryFunction(id, options);
}

export function PageController(
  id: string,
  options: MenuOptions,
  layout?: ComponentInfo,
) {
  assertHasCategoryOrModule(id, options, "Page");
  assertValidLiveOptions(id, options);
  const resolvedOptions = applyModuleResolution(id, options);
  const resolvedCategory = resolveCategoryInfo(resolvedOptions.category);
  validateNotInsideSettings(resolvedOptions.module, resolvedCategory);

  const fullSlug = calculateFullSlug(id, resolvedOptions);
  const cl = class extends Controller(pageRoutePath(fullSlug)) {};

  const meta = GetMetadata(cl, PageMetadata);
  meta.SetInfo(id, fullSlug, resolvedOptions, layout);

  return cl;
}

export function RootPageController(
  id: string,
  options: Omit<MenuOptions, "category" | "module"> & {
    isModuleRoot?: boolean;
  },
  layout?: ComponentInfo,
) {
  assertValidLiveOptions(id, options);
  const fullSlug = calculateFullSlug(id, options);
  const cl = class extends Controller(pageRoutePath(fullSlug)) {};

  const meta = GetMetadata(cl, PageMetadata);
  meta.SetInfo(id, fullSlug, options, layout);

  return cl;
}

/**
 * Register a resolver contributing per-request entries under an existing
 * category. The resolver runs during `/sitelayout`, and its entries are grafted
 * onto that request's tree copy only — the global navigation tree is never
 * touched, so one tenant's entries can never reach another's site layout.
 *
 * Dynamic and static children of the category sort together by `order`, then
 * by display name and id — so entries that share a rank keep the same order on
 * every host and across restarts.
 *
 * Entries link to an already registered page, so a single page (typically with
 * `validation.requiredQueryParams`) serves them all. An entry's `permissionId`
 * decides whether it is **listed**, nothing more: the target page receives the
 * entry's `query` like any other caller-supplied input and must authorize the
 * value itself. The menu is a convenience, never a boundary.
 *
 * Providers run concurrently, and one that throws — or does not answer within
 * two seconds — contributes nothing to that request and is reported once: the
 * rest of the menu still resolves, and its entries come back when it does.
 * Call `NotifyMenuChanged()` when the underlying data changes.
 *
 * The registration is bound to the **registering** module, not to the category
 * it targets: a provider whose category is not (or no longer) registered lies
 * dormant and resolves again as soon as the category appears, so module start
 * order and hot reloads need no coordination.
 *
 * @param categoryFullId Dot-separated `fullId` of the parent category.
 * @param resolver Called once per site-layout request.
 * @returns Removes this provider, for the rare case a module drops it while
 * staying loaded.
 */
export function RegisterDynamicMenuProvider(
  categoryFullId: string,
  resolver: DynamicMenuResolver,
): () => void {
  const info: DynamicMenuProviderInfo = { categoryFullId, resolver };
  internal.RegisterDynamicMenuProvider.register(info);
  return () => internal.RegisterDynamicMenuProvider.unregister(info);
}

/**
 * Signal that the navigation menu's underlying data changed (e.g. a project was
 * created or deleted), so connected clients resync their site layout.
 *
 * The signal carries no data: it is an invalidation, and each client re-fetches
 * its own `/sitelayout`, which is resolved against its own permissions.
 *
 * Pass the `tenantId` whose data changed so only that tenant's sessions
 * re-fetch; omitting it invalidates the menu for every connected session, which
 * is meant for changes that are not tenant-scoped.
 */
export const NotifyMenuChanged =
  InterfaceFunction<(tenantId?: string) => void>();

const RESERVED_ROOT_CATEGORY_IDS = new Set(["pages", "modules", "settings"]);

/**
 * Create a new top-level category at the root of the sidebar, alongside the
 * built-in Pages / Modules / Settings groups. Use this to register your own
 * top-level navigation group with its own label, icon and order. Pages and
 * nested categories can then target it via `category`.
 *
 * Defaults `type` to `"label"` so the category renders as a section heading.
 */
export function RootCategory(
  id: string,
  options: Omit<MenuOptions, "category" | "module">,
): CategoryInfo {
  if (RESERVED_ROOT_CATEGORY_IDS.has(id)) {
    throw new Error(
      `RootCategory id "${id}" is reserved by the built-in Pages/Modules/Settings groups. Choose a different id.`,
    );
  }
  return createRootCategory(id, {
    ...options,
    type: options.type ?? "label",
  });
}

/**
 * The renderer a frontend module is written for. The DMS keys its frontend
 * registry on it, and serves a renderer only the modules registered for its
 * name and the major of its version.
 *
 * It names a framework, not a loader release: `{ name: "vue", version: "3" }`
 * is Vue 3, whichever `@antelopejs/dms-frontend` release loads it. The loader
 * releases a module runs on are declared by the module itself, in the
 * package.json of its `sourcePath`, under `engines` keyed by the loader package
 * (`"@antelopejs/dms-frontend": ">=0.4.0 <0.5.0"`). The loader reads that file,
 * with or without a backend, and refuses a module whose range excludes it; the
 * DMS passes the directory through without reading it.
 */
export interface FrontendRendererMetadata {
  /** Framework the module targets, such as `vue`. */
  name: string;
  /** Version of that framework, compared by major only, such as `3`. */
  version: string;
}

export type FrontendModuleValue =
  | string
  | number
  | boolean
  | null
  | FrontendModuleValue[]
  | FrontendModuleOptions;

export interface FrontendModuleOptions {
  [key: string]: FrontendModuleValue;
}

export interface AddFrontendModuleOptions {
  name: string;
  sourcePath: string;
  renderer: FrontendRendererMetadata;
  options?: FrontendModuleOptions;
  privateOptions?: FrontendModuleOptions;
  priority?: number;
  configKey?: string;
  /**
   * Absolute backend API paths (`/api/...`) the frontend server may open a
   * session from on behalf of this module.
   *
   * A module whose own flow ends on an authenticated user — a self-service
   * registration completing, an invitation being redeemed — names here the
   * backend route that mints the token pair. The frontend server then accepts
   * that path on its `/auth/establish` route and seals its session cookie from
   * the tokens it fetched itself, so the browser never carries one.
   *
   * Declaring a path is what makes it a session-opening route: any backend
   * endpoint left out stays refused, and the operator can still widen the list
   * per deployment through the frontend server's
   * `DMS_AUTH_ESTABLISH_ENDPOINTS`. The DMS's own login, signup and 2FA routes
   * are wired into the frontend server directly and need no declaration.
   *
   * Each entry must be an absolute path under `/api/`, with no query string
   * and no segment that climbs out of it; anything else is rejected at
   * registration.
   */
  authEstablishEndpoints?: string[];
  /**
   * Backend API routes this module serves to callers outside the dashboard: a
   * mail or payment provider's webhook, a script.
   *
   * The frontend server's proxy asks every state-changing request for a
   * same-site `Origin` and sends it with the signed-in user's session. A
   * declared route needs no `Origin`, is never sent the session (so a
   * cross-site form posting to it acts as nobody, and the route authenticates
   * its caller itself), and receives the module's declared headers.
   *
   * Malformed entries are rejected at registration (see
   * {@link FrontendPublicEndpoint}).
   */
  publicEndpoints?: FrontendPublicEndpoint[];
  /**
   * Backend prefixes, outside `/api/**` and `/dms/**`, the browser reaches
   * through the frontend server: a media prefix, a webhook prefix.
   *
   * The frontend server proxies only the prefixes declared to it and answers
   * every other path with a page, so a backend route this module's frontend,
   * a provider or a link calls outside the DMS's prefixes is declared here.
   * Malformed entries are rejected at registration (see
   * {@link FrontendBackendProxy}).
   */
  backendProxies?: FrontendBackendProxy[];
}

/** A backend prefix the frontend server proxies. */
export interface FrontendBackendProxy {
  /**
   * `/x` (that path), `/x/*` (one segment below) or `/x/**` (the path and
   * everything below); the first segment literal, and outside the
   * renderer's own paths (`/api/_dms`, `/@`, `/assets`, `/node_modules`).
   */
  path: string;
  /**
   * `session` (the default): the frontend server adds the session's access
   * token, and a state-changing request needs the frontend's own `Origin`.
   * `none`: never sends the session, for media or a webhook that
   * authenticates its caller itself.
   */
  auth?: "session" | "none";
}

/** A backend route a frontend module serves to anyone. */
export interface FrontendPublicEndpoint {
  /**
   * Absolute path under `/api/`; a `*` segment matches exactly one segment
   * (`/api/mailing/events/:provider` is written `/api/mailing/events/*`). The
   * first segment after `/api/` is literal (the module's own prefix), never
   * `*`. No query string, no prefix match, no `.` / `..` segment.
   */
  path: string;
  /** Methods it answers: GET, HEAD, POST, PUT, PATCH or DELETE. Default `["POST"]`. */
  methods?: string[];
  /**
   * The module's own `x-` request headers the proxy relays to it (a webhook
   * secret). Headers a proxy or the DMS gives a meaning to (`x-forwarded-*`,
   * `x-real-ip`, `x-dms-*`, `x-inertia*`, method overrides) are refused.
   */
  headers?: string[];
}

export const AddFrontendModule =
  InterfaceFunction<(config: AddFrontendModuleOptions) => void>();

/**
 * A module's frontend registration as both the backend and the frontend build
 * compute it from the module's configuration. Its `privateOptions`, if any,
 * hold their shape only, every value an empty string: the backend fills in its
 * secrets before `AddFrontendModule`, and the frontend server fills them from
 * its own environment when it starts (`DMS_HTML_RENDER_SECRET`,
 * `DMS_PRIVATE_OPTIONS`…).
 */
export type FrontendModuleRegistration = AddFrontendModuleOptions;

/** What a {@link FrontendModuleFunction} knows besides the module's config. */
export interface FrontendModuleContext {
  /** Whether the project runs in development, as the core reports it. */
  dev: boolean;
}

/**
 * The pure `config → registration` function a module ships with its
 * frontend, named in its package.json:
 *
 * ```json
 * { "dmsFrontend": "dist/frontend-module.js" }
 * ```
 *
 * The file exports it as `frontendModule`. The backend passes its result to
 * `AddFrontendModule` (adding the private options); `@antelopejs/dms-frontend`
 * calls it with the configuration it evaluates from `antelope.config.ts`, so
 * a frontend builds and starts without asking a backend. It reads nothing
 * but its arguments: no runtime interface, no database, no network. A module
 * that registers no frontend in this configuration returns `undefined`.
 */
export type FrontendModuleFunction<TConfig = unknown> = (
  config: TConfig,
  context: FrontendModuleContext,
) => FrontendModuleRegistration | undefined;

export interface FrontendModuleMetadata {
  name: string;
  sourcePath: string;
  renderer: FrontendRendererMetadata;
  priority: number;
  options: FrontendModuleOptions;
  /**
   * Absolute backend API paths (`/api/...`) the frontend server may open a
   * session from on behalf of this module, as declared by
   * {@link AddFrontendModuleOptions.authEstablishEndpoints}. Empty when the
   * module declared none, absent when the DMS serving this metadata predates
   * the field.
   */
  authEstablishEndpoints?: string[];
  /**
   * The routes this module serves to anyone, as declared by
   * {@link AddFrontendModuleOptions.publicEndpoints}. Empty when the module
   * declared none, absent when the DMS serving this metadata predates the
   * field.
   */
  publicEndpoints?: FrontendPublicEndpoint[];
  /**
   * The backend prefixes this module declares, as
   * {@link AddFrontendModuleOptions.backendProxies}, each with its `auth`.
   * Empty when the module declared none, absent when the DMS serving this
   * metadata predates the field.
   */
  backendProxies?: Required<FrontendBackendProxy>[];
}

/** Returns registered frontend source metadata for server-side module discovery, excluding private options. */
export const GetFrontendModules =
  InterfaceFunction<() => FrontendModuleMetadata[]>();

/**
 * Fired whenever the list {@link GetFrontendModules} returns changes: a
 * module registered its frontend (or replaced it with a higher priority), or
 * a module was taken down with its frontend. Modules start in parallel, so a
 * module that reads the list in its own `start()` may run before another
 * registers: it registers a handler, reads the list once, and reads it again
 * in the handler.
 *
 * @example
 * FrontendModulesChanged.register(() => void refresh());
 * await refresh(); // reads GetFrontendModules()
 */
export const FrontendModulesChanged = new EventProxy<() => void>(
  "dms.page.FrontendModulesChanged",
);
