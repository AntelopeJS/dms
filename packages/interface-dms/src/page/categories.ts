import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, RegisteringProxy } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { fireAndForget } from "../utils/fire-and-forget";
import {
  MarkModuleScopedPermission,
  type Permission,
  RegisterPermission,
} from "../permissions";
import { assertExtensionKeysAvailable } from "./extension-assembly";
// Categories resolve controller classes through their PageMetadata, and the
// metadata module registers pages through the proxies declared here: the
// two-way import stays safe because neither module dereferences the other
// while they evaluate — only from inside function bodies.
// Deliberate and documented above: categories resolve controller
// classes through PageMetadata, and metadata registers pages
// through the proxies declared in categories. Neither module
// dereferences the other while it evaluates.
// oxlint-disable-next-line import/no-cycle
import { PageMetadata } from "./metadata";
import {
  acceptsPageExtensions,
  moduleDefaultCategories,
  moduleRootCategories,
  pageExtensions,
  categoryIdentity,
  dynamicMenuProviderIdentity,
  isSamePageRegistration,
  moduleIdentity,
  pageExtensionIdentity,
  pageIdentity,
  pageMetadataByFullId,
  type RegistrationIdentity,
  syncTargetExtensions,
} from "./registry";
import {
  type CategoryInfo,
  type DynamicMenuProviderInfo,
  type MenuOptions,
  type ModuleInfo,
  type PageExtensionInfo,
  type PageInfo,
  ROOT_SLUG,
} from "./types";

/**
 * A registration proxy that accepts a per-context view of its entries.
 *
 * `RegisteringProxy` looks its entries up by object reference, and anything
 * that crossed the interface boundary comes back as a view of itself. A caller
 * unregistering with the object it holds — a module tearing its pages down, or
 * a test holding `metadata.pageInfo` — would match nothing, and the page would
 * stay in the registry, routed and still serving. Every entry point resolves
 * the view back to the reference the registration was filed under first.
 */
class IdentifiedRegisteringProxy<T extends object> extends RegisteringProxy<
  (value: T) => void
> {
  constructor(private readonly identity: RegistrationIdentity<T>) {
    super();
  }

  override register(value: T): void {
    this.identity.remember(value);
    super.register(value);
  }

  override unregister(value: T): void {
    const registered = this.identity.resolve(value);
    this.identity.forget(registered);
    super.unregister(registered);
  }
}

/**
 * @internal
 */
export namespace internal {
  export const RegisterCategory = new IdentifiedRegisteringProxy<CategoryInfo>(
    categoryIdentity,
  );
  export const RegisterPage = new IdentifiedRegisteringProxy<PageInfo>(
    pageIdentity,
  );
  export const RegisterModule = new IdentifiedRegisteringProxy<ModuleInfo>(
    moduleIdentity,
  );
  export const RegisterDynamicMenuProvider =
    new IdentifiedRegisteringProxy<DynamicMenuProviderInfo>(
      dynamicMenuProviderIdentity,
    );

  export const RegisterPageExtension =
    new IdentifiedRegisteringProxy<PageExtensionInfo>(pageExtensionIdentity);

  export function clearModuleResolution(id: string): void {
    moduleRootCategories.delete(id);
    moduleDefaultCategories.delete(id);
  }

  export function applyPageExtension(info: PageExtensionInfo): void {
    const registered = pageExtensions.get(info.targetFullId) ?? [];
    assertExtensionKeysAvailable(info, registered);
    registered.push(info);
    pageExtensions.set(info.targetFullId, registered);
    if (!acceptsPageExtensions(info.targetFullId)) {
      Logging.Info(
        `[dms] page extension "${info.extensionName}" is waiting for page "${info.targetFullId}" to finish registering`,
      );
    }
    fireAndForget(
      syncTargetExtensions(info.targetFullId),
      `page extension "${info.extensionName}"`,
    );
  }

  export function revokePageExtension(info: PageExtensionInfo): void {
    const registered = pageExtensions.get(info.targetFullId);
    if (!registered) return;
    // By token: the implementation hands the extension back as a view of
    // itself, and dropping it by reference would revoke nothing.
    const remaining = registered.filter(
      (entry) => !pageExtensionIdentity.isSame(entry, info),
    );
    if (remaining.length === 0) {
      pageExtensions.delete(info.targetFullId);
    } else {
      pageExtensions.set(info.targetFullId, remaining);
    }
    fireAndForget(
      syncTargetExtensions(info.targetFullId),
      `page extension "${info.extensionName}" teardown`,
    );
  }

  /**
   * Take down the metadata registered for a page.
   *
   * `expected` names the registration being unwound. A hot reload registers
   * the replacement before the old one unregisters, so without it the departing
   * page would tear down the live one's metadata, layout handler and
   * permissions.
   */
  export function clearPageMetadata(fullId: string, expected?: PageInfo): void {
    const metadata = pageMetadataByFullId.get(fullId);
    if (!metadata) return;
    if (expected && !isSamePageRegistration(metadata.pageInfo, expected))
      return;
    metadata.Dispose();
  }

  export interface RootCategoryOptions extends Omit<MenuOptions, "category"> {
    category?: CategoryInfo | ControllerClass;
    isModuleRoot?: boolean;
  }

  export function RootCategory(
    id: string,
    options: RootCategoryOptions,
  ): CategoryInfo {
    return createCategoryFunction(id, options);
  }
}

interface ModuleEntry {
  module?: string;
  category?: CategoryInfo | ControllerClass;
  isModuleRoot?: boolean;
}

export function isInsideModule(entry: ModuleEntry): boolean {
  if (entry.isModuleRoot) return true;
  if (entry.module) return true;
  let current: CategoryInfo | ControllerClass | undefined = entry.category;
  while (current) {
    const resolved = resolveCategoryInfo(current);
    if (!resolved) return false;
    if (resolved.isModuleRoot) return true;
    current = resolved.category;
  }
  return false;
}

/**
 * Resolve a category to CategoryInfo
 * @param category A CategoryInfo object or a ControllerClass
 * @returns The resolved CategoryInfo
 */
export function resolveCategoryInfo(
  category: CategoryInfo | ControllerClass | undefined,
): CategoryInfo | undefined {
  if (!category) {
    return undefined;
  }

  if (typeof category === "function") {
    const meta = GetMetadata(category, PageMetadata);
    if (!meta.pageInfo) {
      throw new Error(`PageMetadata not initialized for controller class.`);
    }
    return meta.pageInfo;
  }

  return category;
}

/**
 * Calculate the full slug for a page or category
 * @param id The unique identifier
 * @param options Menu options containing urlSlug and category
 * @returns The calculated full slug
 */
export function calculateFullSlug(
  id: string,
  options: MenuOptions | internal.RootCategoryOptions,
): string {
  const resolvedCategory = resolveCategoryInfo(options.category);

  const parentSlug = resolvedCategory?.fullSlug || "";
  const urlSlug = options.urlSlug || id;
  let fullSlug = parentSlug ? `${parentSlug}/${urlSlug}` : `/${urlSlug}`;
  fullSlug = fullSlug.replace(/\/+/g, "/");

  if (fullSlug !== "/" && fullSlug.endsWith("/")) {
    fullSlug = fullSlug.slice(0, -1);
  }

  return fullSlug;
}

function isCategoryDescendantOf(
  candidate: CategoryInfo | undefined,
  ancestorFullId: string,
): boolean {
  let current: CategoryInfo | ControllerClass | undefined = candidate;
  while (current) {
    const resolved = resolveCategoryInfo(current);
    if (!resolved) return false;
    if (resolved.fullId === ancestorFullId) return true;
    current = resolved.category;
  }
  return false;
}

function resolveCategoryFromOptions(
  id: string,
  options: MenuOptions,
): CategoryInfo | ControllerClass | undefined {
  if (options.category) {
    if (options.module) {
      validateExplicitCategoryMatchesModule(
        id,
        options.category,
        options.module,
      );
    }
    return options.category;
  }
  if (options.module) {
    const moduleRoot = moduleRootCategories.get(options.module);
    if (!moduleRoot) {
      throw new Error(
        `"${id}" references unknown module "${options.module}". Make sure RegisterModule was called before registration.`,
      );
    }
    // Loose pages attach to the module's default category when one is declared,
    // so they render under a controllable heading instead of the generic
    // "Pages" group. Otherwise they sit directly under the module root.
    return moduleDefaultCategories.get(options.module) ?? moduleRoot;
  }
  return undefined;
}

function validateExplicitCategoryMatchesModule(
  id: string,
  category: CategoryInfo | ControllerClass,
  moduleId: string,
): void {
  const moduleRoot = moduleRootCategories.get(moduleId);
  if (!moduleRoot) {
    throw new Error(
      `Page "${id}" references unknown module "${moduleId}". Make sure RegisterModule was called before page registration.`,
    );
  }
  const resolved = resolveCategoryInfo(category);
  if (!isCategoryDescendantOf(resolved, moduleRoot.fullId)) {
    throw new Error(
      `Page "${id}" declares module "${moduleId}" but its explicit category is not a descendant of that module's root.`,
    );
  }
}

// The settings root is compared by its stable fullId, not through the
// `settingsCategory` object: that object lives in the bootstrap module, which
// this module underpins — importing it back would make the graph circular for
// a check that only needs the id.
const SETTINGS_ROOT_FULL_ID = "settings";

export function validateNotInsideSettings(
  moduleId: string | undefined,
  resolved: CategoryInfo | undefined,
): void {
  if (!moduleId || !resolved) return;
  if (isCategoryDescendantOf(resolved, SETTINGS_ROOT_FULL_ID)) {
    throw new Error(
      `Pages of module "${moduleId}" cannot use the settings category — declare a settings page inside your module instead.`,
    );
  }
}

export function createCategoryFunction(
  id: string,
  options: internal.RootCategoryOptions,
): CategoryInfo;
export function createCategoryFunction(
  id: string,
  options: MenuOptions,
): CategoryInfo;
export function createCategoryFunction(
  id: string,
  options: MenuOptions | internal.RootCategoryOptions,
): CategoryInfo {
  const hasModuleField =
    "module" in options && (options as MenuOptions).module !== undefined;
  const effectiveOptions = hasModuleField
    ? applyModuleResolution(id, options as MenuOptions)
    : options;

  const category = effectiveOptions.category;
  const resolvedCategory = resolveCategoryInfo(category);

  if (hasModuleField) {
    validateNotInsideSettings(
      (effectiveOptions as MenuOptions).module,
      resolvedCategory,
    );
  }

  const parentFullId = resolvedCategory?.fullId || "";
  const fullId = parentFullId ? `${parentFullId}.${id}` : id;

  const fullSlug = calculateFullSlug(id, effectiveOptions);

  const categoryInfo: CategoryInfo = {
    ...effectiveOptions,
    category: resolvedCategory,
    id,
    fullId,
    fullSlug,
    urlTransparent: fullSlug === (resolvedCategory?.fullSlug || ROOT_SLUG),
    hidden: effectiveOptions.hidden || resolvedCategory?.hidden,
    bypassTenantAccessGate:
      effectiveOptions.bypassTenantAccessGate ||
      resolvedCategory?.bypassTenantAccessGate,
  };

  internal.RegisterCategory.register(categoryInfo);
  // Left exactly as it was, and it is wrong: when `permission` is an Action,
  // the spread copies the action's `id` and `definition` over the category's
  // own and leaves the permission with no title, so the category registers
  // under the action's short id while `resolvePagePermissionId` later looks it
  // up under the full one.
  //
  // Not fixed here. registerPagePermission converts through `toPermission()`
  // and skips registration when it succeeds, but it runs at page-registration
  // time; a category is built at import time, before `permissionMap` holds the
  // component, so `toPermission()` returns undefined and the same spread runs
  // anyway. Making this right means deciding when a category's permission is
  // resolved, which is a design question and not a lint pass.
  const categoryPermission: Permission = {
    id: categoryInfo.fullId,
    title: categoryInfo.displayName,
    icon: categoryInfo.icon,
    defaultGranted: categoryInfo.publicAccess,
    // oxlint-disable-next-line typescript/no-misused-spread
    ...categoryInfo.permission,
  };
  if (isInsideModule(categoryInfo)) {
    MarkModuleScopedPermission(categoryPermission.id);
  } else {
    RegisterPermission(categoryPermission.id, categoryPermission);
  }

  return categoryInfo;
}

export function applyModuleResolution(
  id: string,
  options: MenuOptions,
): MenuOptions {
  const resolvedReference = resolveCategoryFromOptions(id, options);
  return { ...options, category: resolvedReference };
}
