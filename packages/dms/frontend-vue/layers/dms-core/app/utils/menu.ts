import type { NavigationMenuItem } from "@nuxt/ui";
import { parseLinkQuery, stripQueryAndHash } from "./routePath";

// Menu items carry the registered page/category's dot-separated `fullId`
// (e.g. `pages.erp.orders`) plus the DMS semantic fields; Nuxt UI's
// NavigationMenuItem type doesn't know about them, so they are read through
// `DmsMenuItem`.

// Semantic status → theme color, shared by every menu rendering (expanded
// sidebar icon, collapsed sidebar dot). A dot renders it as `bg-current`, so one
// map covers both.
export const MENU_STATUS_TEXT_CLASSES: Record<MenuItemStatus, string> = {
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  neutral: "text-dimmed",
};

/** Status colors for the chip on a parent entry's leading icon. */
export const MENU_STATUS_CHIP_COLORS = {
  success: "success",
  warning: "warning",
  error: "error",
  neutral: "neutral",
} as const satisfies Record<MenuItemStatus, string>;

export const translateMenuItem = (
  item: NavigationMenuItem,
  processI18n: (value: string) => string,
): NavigationMenuItem => ({
  ...item,
  label: item.label ? processI18n(item.label) : undefined,
  children: item.children
    ? item.children.map((child) => translateMenuItem(child, processI18n))
    : undefined,
});

export const translateMenuItems = (
  items: NavigationMenuItem[][],
  processI18n: (value: string) => string,
): NavigationMenuItem[][] => {
  return items.map((group) =>
    group.map((item) => translateMenuItem(item, processI18n)),
  );
};

// Whether `item` is the matched page itself or one of its ancestors in the
// registered category hierarchy. fullId-based to avoid URL-prefix pitfalls:
// hidden pages still resolve via `findMatchingRoute` and custom-pages can have
// urlSlugs that escape their parent category's URL.
export const shouldExpandMenuItem = (
  item: NavigationMenuItem,
  matchedFullId: string | null,
): boolean => {
  if (!matchedFullId) return false;
  const fullId = (item as DmsMenuItem).fullId;
  if (typeof fullId !== "string" || fullId === "") return false;
  return matchedFullId === fullId || matchedFullId.startsWith(`${fullId}.`);
};

const normalizeRoutePath = (path: string): string =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

// The current route is the link itself or one of its sub-routes. Auto-generated
// detail views (e.g. `/orders/detail/42`) live under their parent page's URL but
// are never registered as menu links, so plain route matching would drop the
// parent's highlight.
const matchesRoutePrefix = (currentPath: string, to: string): boolean => {
  const target = normalizeRoutePath(to);
  const current = normalizeRoutePath(currentPath);
  if (target === "" || target === "/") return current === target;
  return current === target || current.startsWith(`${target}/`);
};

const resolveItemTarget = (
  to: NavigationMenuItem["to"],
): MenuItemTarget | null => {
  if (typeof to === "string") {
    return { path: stripQueryAndHash(to), query: parseLinkQuery(to) };
  }
  const target = to as MenuItemTarget | undefined;
  if (target && typeof target.path === "string") {
    return { path: target.path, query: target.query };
  }
  return null;
};

const hasQuery = (target: MenuItemTarget | null): boolean =>
  Object.keys(target?.query ?? {}).length > 0;

// Subset match: the entry's own parameters must be the current ones, while
// unrelated parameters the page adds (tabs, filters) are ignored.
const queryMatches = (
  declared: MenuItemTarget["query"],
  currentQuery: Record<string, unknown>,
): boolean => {
  if (!declared) return true;
  return Object.entries(declared).every(
    ([key, value]) => currentQuery[key] === value,
  );
};

/** Highlights a parent on sub-routes only when no descendant is active. */
export const isMenuItemActive = (
  item: NavigationMenuItem,
  matchedFullId: string | null,
  currentRoute: MenuRouteState,
  isDescendantActive = false,
): boolean => {
  const target = resolveItemTarget(item.to);
  if (!target) return false;
  if (!queryMatches(target.query, currentRoute.query)) return false;
  const matchesRoute =
    item.children?.length && isDescendantActive
      ? normalizeRoutePath(currentRoute.path) ===
        normalizeRoutePath(target.path)
      : matchesRoutePrefix(currentRoute.path, target.path);
  if (matchesRoute) return true;
  const fullId = (item as DmsMenuItem).fullId;
  return matchedFullId !== null && fullId === matchedFullId;
};

/**
 * Query entries and parents override native prefix highlighting. Plain leaves
 * keep the router's fallback for routes the DMS cannot string-match.
 */
const resolveActiveState = (
  item: NavigationMenuItem,
  isActive: boolean,
): Partial<Pick<NavigationMenuItem, "active">> => {
  if (isActive) {
    return { active: true };
  }
  return hasQuery(resolveItemTarget(item.to)) || item.children?.length
    ? { active: false }
    : {};
};

interface MenuRouteVerdict {
  item: NavigationMenuItem;
  holdsActive: boolean;
}

function judgeMenuRoute(
  item: NavigationMenuItem,
  matchedFullId: string | null,
  currentRoute: MenuRouteState,
): MenuRouteVerdict {
  const children = item.children?.map((child) =>
    judgeMenuRoute(child, matchedFullId, currentRoute),
  );
  const descendantActive =
    children?.some((child) => child.holdsActive) ?? false;
  const active = isMenuItemActive(
    item,
    matchedFullId,
    currentRoute,
    descendantActive,
  );
  const holdsActive = active || descendantActive;
  return {
    holdsActive,
    item: {
      ...item,
      ...resolveActiveState(item, active),
      defaultOpen: children?.length
        ? holdsActive || shouldExpandMenuItem(item, matchedFullId)
        : undefined,
      children: children?.map((child) => child.item),
    },
  };
}

/** Computes highlight and expansion together, from descendants to ancestors. */
export const applyMenuRouteState = (
  items: NavigationMenuItem[][],
  matchedFullId: string | null,
  currentRoute: MenuRouteState,
): NavigationMenuItem[][] => {
  return items.map((group) =>
    group.map((item) => judgeMenuRoute(item, matchedFullId, currentRoute).item),
  );
};

const collectExpandedIds = (items: NavigationMenuItem[]): string[] => {
  const ids: string[] = [];
  for (const item of items) {
    if (typeof item.id === "string" && item.defaultOpen) {
      ids.push(item.id);
    }
    if (item.children) ids.push(...collectExpandedIds(item.children));
  }
  return ids;
};

/** Reads the expansion verdict for controlled accordions. */
export const collectOpenItemIds = (items: NavigationMenuItem[][]): string[] => {
  return items.flatMap((group) => collectExpandedIds(group));
};
