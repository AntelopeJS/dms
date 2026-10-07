import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { ComponentInfo } from "../../component";
import {
  MarkModuleScopedPermission,
  type Permission,
  RegisterPermission,
} from "../../permissions";
// Categories resolve controller classes through their PageMetadata, and the
// metadata module registers pages through the proxies declared in
// ../categories: the cycle stays safe because none of these modules
// dereferences another while it evaluates — only from inside function bodies.
// oxlint-disable-next-line import/no-cycle
import { PageMetadata } from "../metadata";
import { Logging } from "@antelopejs/interface-core/logging";
import { fireAndForget } from "../../utils/fire-and-forget";
import {
  acceptsPageExtensions,
  isSamePageRegistration,
  moduleDefaultCategories,
  moduleRootCategories,
  pageExtensionIdentity,
  pageExtensions,
  pageMetadataByFullId,
  syncTargetExtensions,
} from "./registry";
import type {
  CategoryInfo,
  MenuOptions,
  PageExtensionInfo,
  PageInfo,
} from "../types";
import { ROOT_SLUG } from "./types";
// The proxies and isInsideModule are only read inside function bodies; see
// the matching import in ../categories.
// oxlint-disable-next-line import/no-cycle
import { internal, isInsideModule } from "../categories";

/**
 * Resolve a category to CategoryInfo
 * @param category A CategoryInfo object or a ControllerClass
 * @returns The resolved CategoryInfo
 *
 * @internal
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
 * The default layout a page or category declared under `category` inherits:
 * the `layout` of the nearest ancestor that declares one.
 *
 * @param category The parent the entry is declared under
 * @returns That layout, or undefined when no ancestor declares one
 *
 * @internal
 */
export function resolveInheritedLayout(
  category: CategoryInfo | ControllerClass | undefined,
): ComponentInfo | undefined {
  let current = findCategoryInfo(category);
  while (current) {
    if (current.layout) return current.layout;
    current = findCategoryInfo(current.category);
  }
  return undefined;
}

// Unlike resolveCategoryInfo, a parent class that is not a registered page
// ends the walk instead of throwing: the page declaring it reports that when
// it registers, not while its layout is being chosen.
function findCategoryInfo(
  category: CategoryInfo | ControllerClass | undefined,
): CategoryInfo | undefined {
  if (typeof category !== "function") return category;
  return GetMetadata(category, PageMetadata).pageInfo;
}

/**
 * Calculate the full slug for a page or category
 * @param id The unique identifier
 * @param options Menu options containing urlSlug and category
 * @returns The calculated full slug
 *
 * @internal
 */
export function calculateFullSlug(
  id: string,
  options: MenuOptions | RootCategoryOptions,
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

/** @internal */
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

/** @internal */
export function createCategoryFunction(
  id: string,
  options: RootCategoryOptions,
): CategoryInfo;
/** @internal */
export function createCategoryFunction(
  id: string,
  options: MenuOptions,
): CategoryInfo;
export function createCategoryFunction(
  id: string,
  options: MenuOptions | RootCategoryOptions,
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
    defaultGranted: categoryInfo.publicAccess || categoryInfo.memberAccess,
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

/** @internal */
export function applyModuleResolution(
  id: string,
  options: MenuOptions,
): MenuOptions {
  const resolvedReference = resolveCategoryFromOptions(id, options);
  return { ...options, category: resolvedReference };
}

/** @internal */
export function clearModuleResolution(id: string): void {
  moduleRootCategories.delete(id);
  moduleDefaultCategories.delete(id);
}

/** @internal */
export function applyPageExtension(info: PageExtensionInfo): void {
  const registered = pageExtensions.get(info.targetFullId) ?? [];
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

/** @internal */
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
 *
 * @internal
 */
export function clearPageMetadata(fullId: string, expected?: PageInfo): void {
  const metadata = pageMetadataByFullId.get(fullId);
  if (!metadata) return;
  if (expected && !isSamePageRegistration(metadata.pageInfo, expected)) return;
  metadata.Dispose();
}

/** @internal */
export interface RootCategoryOptions extends Omit<MenuOptions, "category"> {
  category?: CategoryInfo | ControllerClass;
  isModuleRoot?: boolean;
}

/** @internal */
export function RootCategory(
  id: string,
  options: RootCategoryOptions,
): CategoryInfo {
  return createCategoryFunction(id, options);
}
