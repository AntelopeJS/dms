import {
  setSlugProvider,
  warnOnceFor,
  scheduleBroadcast,
} from "../../../store/frontend";
import {
  pagesBySlug,
  findPageByFullId,
  resolvePagePermissionId,
} from "../../../utils";
import {
  type CategoryInfo,
  type PageInfo,
  isInsideModule,
  ClearPageLayoutBySlug,
  type ModuleInfo,
  type DynamicMenuProviderInfo,
  type PageExtensionInfo,
} from "@antelopejs/interface-dms/page";
import { Logging } from "@antelopejs/interface-core/logging";
import { UnmarkModuleScopedPermission } from "@antelopejs/interface-dms/permissions";
import {
  clearPageMetadata,
  clearModuleResolution,
  applyPageExtension,
  revokePageExtension,
} from "@antelopejs/interface-dms/page/internal/categories";
import { clearPageTopics } from "../../../realtime";
import {
  categoriesByFullId,
  navigationTree,
  moduleRegistry,
  dynamicMenuProviders,
} from "./state";
import type { SiteLayoutTree } from "./types";
import { notifyStructureChanged } from "./notifications";

setSlugProvider(() => Object.keys(pagesBySlug));

export function warnOnSlugCollision<
  T extends { fullSlug: string; fullId: string },
>(existing: T | undefined, incoming: T): void {
  if (!existing || existing.fullId === incoming.fullId) return;
  warnOnceFor(
    incoming,
    "slug-collision",
    `[dms] "${incoming.fullId}" claims the slug "${incoming.fullSlug}", already served by "${existing.fullId}": the later registration wins.`,
  );
}

export function findNavigableCategoryBySlug(
  slug: string,
): CategoryInfo | undefined {
  return Object.values(categoriesByFullId).find(
    (category) => !category.urlTransparent && category.fullSlug === slug,
  );
}

export function findNavigationEntryByFullId(
  fullId: string,
): PageInfo | CategoryInfo | undefined {
  return categoriesByFullId[fullId] ?? findPageByFullId(fullId);
}

export const warnedMissingCategories = new Set<string>();

export const suspectedMissingCategories = new Set<string>();

export let missingCategoryCheck: NodeJS.Timeout | undefined;

export const MISSING_CATEGORY_SETTLE_MS = 250;

export function suspectMissingCategory(categoryFullId: string): void {
  if (warnedMissingCategories.has(categoryFullId)) return;
  suspectedMissingCategories.add(categoryFullId);
  missingCategoryCheck ??= setTimeout(
    reportMissingCategories,
    MISSING_CATEGORY_SETTLE_MS,
  );
  missingCategoryCheck.unref();
}

export function findTreeNode(fullId: string): SiteLayoutTree | undefined {
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

export function ensureContainer(
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

export function addToTree(newPageInfo: PageInfo | CategoryInfo) {
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

export function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function compareMenuChildren(
  a: SiteLayoutTree,
  b: SiteLayoutTree,
): number {
  return (
    (a.order ?? 0) - (b.order ?? 0) ||
    compareText(a.displayName, b.displayName) ||
    compareText(a.id, b.id)
  );
}

export function sortChildIdsByOrder(
  children: Record<string, SiteLayoutTree>,
): string[] {
  return Object.keys(children).sort((a, b) =>
    compareMenuChildren(children[a], children[b]),
  );
}

export function updateChildrenOrders(node: SiteLayoutTree) {
  node.childrenOrders = sortChildIdsByOrder(node.children);
  for (const child of node.childrenOrders) {
    updateChildrenOrders(node.children[child]);
  }
}

/**
 * Depth-first sidebar positions in `childrenOrders` order, keyed by each
 * entry's permission id and, when different, its full id.
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
 * Registered category permission ids, excluding page and component ids.
 */
export function GetCategoryPermissionIds(): Set<string> {
  return new Set(
    Object.values(categoriesByFullId).map((category) =>
      resolvePagePermissionId(category.permission, category.fullId),
    ),
  );
}

/**
 * Permission ids of registered pages and categories, excluding components
 * and actions. Includes entries below universally granted categories.
 */
export function GetMenuEntryPermissionIds(): Set<string> {
  return new Set(
    [...Object.values(pagesBySlug), ...Object.values(categoriesByFullId)].map(
      (entry) => resolvePagePermissionId(entry.permission, entry.fullId),
    ),
  );
}

export function removeFromTree(fullId: string) {
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

export namespace internal {
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

      clearPageMetadata(pageInfo.fullId, pageInfo);

      ClearPageLayoutBySlug(pageInfo.fullSlug);

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

export function isContainerWithoutEntry(node: SiteLayoutTree): boolean {
  return node.fullId === "";
}

export function holdsContainerWithoutEntry(node: SiteLayoutTree): boolean {
  return Object.values(node.children).some(isContainerWithoutEntry);
}
