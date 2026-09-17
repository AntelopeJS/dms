import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, InterfaceFunction } from "@antelopejs/interface-core";
import { MakeClassDecorator } from "@antelopejs/interface-core/decorators";
import { Logging } from "@antelopejs/interface-core/logging";
import { Component, type ComponentInfo, DEFAULT_PLACEMENT } from "../component";
import {
  applyModuleResolution,
  calculateFullSlug,
  createCategoryFunction,
  internal,
  resolveCategoryInfo,
  validateNotInsideSettings,
} from "./categories";
import { PageMetadata } from "./metadata";
import type {
  CategoryInfo,
  DynamicMenuProviderInfo,
  DynamicMenuResolver,
  MenuOptions,
  PageExtensionComponent,
  PageExtensionInfo,
} from "./types";

interface StaticComponentField {
  key: string;
  component: Component;
}

/**
 * Static component fields of a class, in declaration order. Underscore-prefixed
 * fields are skipped, so a class can keep private static state.
 */
// `object` is the contract: this walks a decorated class whose static
// fields are only known at run time, which is the whole point of the
// decorator. A narrower type would only push an assertion here.
// oxlint-disable-next-line anti-slop/no-object-parameters
function collectStaticComponents(cl: object): StaticComponentField[] {
  const fields: StaticComponentField[] = [];
  for (const key of Object.getOwnPropertyNames(cl)) {
    if (key.startsWith("_")) continue;

    // Reading a static field whose name is only known at run time is the
    // whole job here; the alternative is an assertion to a dictionary.
    // oxlint-disable-next-line anti-slop/no-reflect-get
    const value: unknown = Reflect.get(cl, key);
    if (value instanceof Component) {
      fields.push({ key, component: value });
    }
  }
  return fields;
}

export const RegisterPage = MakeClassDecorator((cl) => {
  const meta = GetMetadata(cl as ControllerClass, PageMetadata);

  for (const { key, component } of collectStaticComponents(cl)) {
    meta.SetComponent(key, component);
  }

  void meta.Register();
});

function buildExtensionComponents(
  // `object` is the contract: this walks a decorated class whose static
  // fields are only known at run time, which is the whole point of the
  // decorator. A narrower type would only push an assertion here.
  // oxlint-disable-next-line anti-slop/no-object-parameters
  extensionClass: object,
): PageExtensionComponent[] {
  return collectStaticComponents(extensionClass).map(({ key, component }) => {
    const placement = component.placement ?? DEFAULT_PLACEMENT;
    // `anchorPath` is set only when the placement names an anchor: its absence
    // is what extension-assembly reads as "append at the end".
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
 * `settings.user.members`.
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
 * @RegisterPageExtension("settings.user.members")
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
    const extensionName =
      (cl as ControllerClass).name || "anonymous page extension";
    if (!targetPageId.trim()) {
      throw new Error(
        `Page extension "${extensionName}" must name the page it extends by its full id, for example "settings.user.members".`,
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

function assertHasCategoryOrModule(
  id: string,
  options: MenuOptions,
  kind: "Page" | "Category",
): void {
  if (!options.category && !options.module) {
    throw new Error(
      `${kind} "${id}" must declare either "category" or "module" in its options.`,
    );
  }
}

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
  const resolvedOptions = applyModuleResolution(id, options);
  const resolvedCategory = resolveCategoryInfo(resolvedOptions.category);
  validateNotInsideSettings(resolvedOptions.module, resolvedCategory);

  const fullSlug = calculateFullSlug(id, resolvedOptions);
  const cl = class extends Controller(fullSlug) {};

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
  const fullSlug = calculateFullSlug(id, options);
  const cl = class extends Controller(fullSlug) {};

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
  // Spread options first so an explicitly-passed type wins, then default an
  // omitted type to "label". Spreading after the default would let an explicit
  // `type: undefined` clobber it.
  return internal.RootCategory(id, {
    ...options,
    type: options.type ?? "label",
  });
}

export interface FrontendRendererMetadata {
  name: string;
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
}

export const AddFrontendModule =
  InterfaceFunction<(config: AddFrontendModuleOptions) => void>();

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
}

/** Returns registered frontend source metadata for server-side module discovery, excluding private options. */
export const GetFrontendModules =
  InterfaceFunction<() => FrontendModuleMetadata[]>();
