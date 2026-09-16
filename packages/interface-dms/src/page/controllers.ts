import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, InterfaceFunction } from "@antelopejs/interface-core";
import { MakeClassDecorator } from "@antelopejs/interface-core/decorators";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  Component,
  type ComponentInfo,
  type ComponentTargetInput,
  DEFAULT_PLACEMENT,
} from "../component";
import {
  applyModuleResolution,
  calculateFullSlug,
  createCategoryFunction,
  internal,
  resolveCategoryInfo,
  validateNotInsideSettings,
} from "./categories";
import {
  componentDeclaresChild,
  resolveComponentTarget,
} from "./component-target";
import { assertKeysAvailable } from "./extension-assembly";
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

/**
 * Every component the target page owns, keyed by its field name. Reads the
 * class's static fields (the extension may be declared before the target ran
 * `@RegisterPage`) and the page metadata (which also carries the components a
 * page class inherits from another).
 */
function collectTargetComponents(
  target: ControllerClass,
  targetMeta: PageMetadata,
): Map<string, Component> {
  const components = new Map<string, Component>();
  for (const { key, component } of collectStaticComponents(target)) {
    components.set(key, component);
  }
  for (const [key, component] of Object.entries(targetMeta.components)) {
    components.set(key, component);
  }
  return components;
}

function resolveAnchorPath(
  anchor: ComponentTargetInput,
  targetComponents: Map<string, Component>,
  contributionKey: string,
  extensionName: string,
  targetFullId: string,
): string[] {
  const resolved = resolveComponentTarget(anchor, targetComponents);
  if (resolved) {
    if (
      resolved.parent &&
      componentDeclaresChild(resolved.parent, contributionKey)
    ) {
      throw new Error(
        `Page extension "${extensionName}" injects child "${contributionKey}" into page "${targetFullId}", but that id already belongs to the anchor's parent. Rename the field.`,
      );
    }
    return [resolved.rootKey, ...resolved.path];
  }
  throw new Error(
    `Page extension "${extensionName}" anchors a component on a position that does not exist on page "${targetFullId}". Anchors must reference a static component field or one of its declared children.`,
  );
}

function buildExtensionComponents(
  // `object` is the contract: this walks a decorated class whose static
  // fields are only known at run time, which is the whole point of the
  // decorator. A narrower type would only push an assertion here.
  // oxlint-disable-next-line anti-slop/no-object-parameters
  extensionClass: object,
  targetComponents: Map<string, Component>,
  extensionName: string,
  targetFullId: string,
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
      entry.anchorPath = resolveAnchorPath(
        placement.anchor,
        targetComponents,
        key,
        extensionName,
        targetFullId,
      );
    }
    return entry;
  });
}

/**
 * Inject components into a page owned by another module. The decorated class is
 * not a page: every static component field on it becomes a component of
 * `target`, keyed by its field name, and therefore permissioned as
 * `<target fullId>.<field name>` in the target page's own permission tree —
 * exactly like a component the target declares itself.
 *
 * Placement is declared on each component with `.before(anchor)` /
 * `.after(anchor)`. An anchor can be a static component field of the target
 * page or a nested position selected with `.targetChild()`. Without one, the
 * component is appended after the page's own components. When several
 * components land at the same spot, `.order(n)` decides, and equal orders fall
 * back to the extension class name then to declaration order — never to module
 * start order.
 *
 * The injection applies as soon as the target page has finished registering —
 * it is held until then whichever module starts first, so anchors always
 * resolve against the page's complete component set — and is removed when the
 * extending module stops. A field name already used by the target page or by another
 * extension of it is a registration error.
 *
 * ```ts
 * @RegisterPageExtension(MembersSettingsController)
 * export class SeatQuotaExtension {
 *   static seatQuota = CustomComponent("SeatQuotaBanner")
 *     .meta({ name: "Seat quota" })
 *     .before(MembersSettingsController.table);
 * }
 * ```
 *
 * @param target The page controller class to extend, imported from its module.
 */
export const RegisterPageExtension = MakeClassDecorator(
  (cl, target: ControllerClass) => {
    const extensionName =
      (cl as ControllerClass).name || "anonymous page extension";
    const targetMeta = GetMetadata(target, PageMetadata);
    if (!targetMeta.pageInfo) {
      throw new Error(
        `Page extension "${extensionName}" targets a class that is not a page. Pass a class built with PageController(...).`,
      );
    }

    const targetFullId = targetMeta.pageInfo.fullId;
    const targetComponents = collectTargetComponents(target, targetMeta);
    const info: PageExtensionInfo = {
      extensionName,
      targetFullId,
      components: buildExtensionComponents(
        cl,
        targetComponents,
        extensionName,
        targetFullId,
      ),
    };

    if (info.components.length === 0) {
      Logging.Warn(
        `[dms] page extension "${extensionName}" declares no component field — nothing is injected into page "${targetFullId}".`,
      );
      return;
    }

    assertKeysAvailable(
      new Map([...targetComponents.keys()].map((key) => [key, targetFullId])),
      info,
    );
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
}

export const AddFrontendModule =
  InterfaceFunction<(config: AddFrontendModuleOptions) => void>();

export interface FrontendModuleMetadata {
  name: string;
  sourcePath: string;
  renderer: FrontendRendererMetadata;
  priority: number;
  options: FrontendModuleOptions;
}

/** Returns registered frontend source metadata for server-side module discovery, excluding private options. */
export const GetFrontendModules =
  InterfaceFunction<() => FrontendModuleMetadata[]>();
