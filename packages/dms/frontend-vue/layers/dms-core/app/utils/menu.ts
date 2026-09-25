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

export const addDefaultOpenToMenuItem = (
  item: NavigationMenuItem,
  matchedFullId: string | null,
): NavigationMenuItem => ({
  ...item,
  defaultOpen: item.children
    ? shouldExpandMenuItem(item, matchedFullId)
    : undefined,
  children: item.children?.map((child) =>
    addDefaultOpenToMenuItem(child, matchedFullId),
  ),
});

export const addDefaultOpenToMenuItems = (
  items: NavigationMenuItem[][],
  matchedFullId: string | null,
): NavigationMenuItem[][] => {
  return items.map((group) =>
    group.map((item) => addDefaultOpenToMenuItem(item, matchedFullId)),
  );
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

// Whether `item` should be highlighted for the current route. Prefix matching is
// restricted to leaf links so a page stays highlighted on its auto-generated
// sub-routes (e.g. `/orders/detail/42`); a parent that carries its own menu
// children highlights on its exact route only, so it never lights up alongside
// an active descendant that already has its own entry. The fullId equality
// fallback covers param routes whose URL never string-matches the `to` pattern.
// Entries sharing one page through query parameters (`/project?project=<id>`)
// are told apart by those parameters, so only one of them lights up.
export const isMenuItemActive = (
  item: NavigationMenuItem,
  matchedFullId: string | null,
  currentRoute: MenuRouteState,
): boolean => {
  const target = resolveItemTarget(item.to);
  if (!target) return false;
  if (!queryMatches(target.query, currentRoute.query)) return false;
  const matchesRoute = item.children?.length
    ? normalizeRoutePath(currentRoute.path) === normalizeRoutePath(target.path)
    : matchesRoutePrefix(currentRoute.path, target.path);
  if (matchesRoute) return true;
  const fullId = (item as DmsMenuItem).fullId;
  return matchedFullId !== null && fullId === matchedFullId;
};

// Only the boolean `true` is set on plain entries: Nuxt UI forwards an explicit
// `active` to the underlying link, and a `false` there would suppress the
// built-in route match. Entries carrying a query always get an explicit value,
// because that built-in match is a URL prefix test that would light up
// `?project=a` on `?project=ab`.
const resolveActiveState = (
  item: NavigationMenuItem,
  matchedFullId: string | null,
  currentRoute: MenuRouteState,
): Partial<Pick<NavigationMenuItem, "active">> => {
  if (isMenuItemActive(item, matchedFullId, currentRoute)) {
    return { active: true };
  }
  return hasQuery(resolveItemTarget(item.to)) ? { active: false } : {};
};

export const addActiveStateToMenuItem = (
  item: NavigationMenuItem,
  matchedFullId: string | null,
  currentRoute: MenuRouteState,
): NavigationMenuItem => ({
  ...item,
  ...resolveActiveState(item, matchedFullId, currentRoute),
  children: item.children?.map((child) =>
    addActiveStateToMenuItem(child, matchedFullId, currentRoute),
  ),
});

export const addActiveStateToMenuItems = (
  items: NavigationMenuItem[][],
  matchedFullId: string | null,
  currentRoute: MenuRouteState,
): NavigationMenuItem[][] => {
  return items.map((group) =>
    group.map((item) =>
      addActiveStateToMenuItem(item, matchedFullId, currentRoute),
    ),
  );
};

const collectExpandedIds = (
  items: NavigationMenuItem[],
  matchedFullId: string,
): string[] => {
  const ids: string[] = [];
  for (const item of items) {
    if (item.id && shouldExpandMenuItem(item, matchedFullId)) {
      ids.push(item.id as string);
      if (item.children) {
        ids.push(...collectExpandedIds(item.children, matchedFullId));
      }
    }
  }
  return ids;
};

export const getExpandedItemIds = (
  items: NavigationMenuItem[][],
  matchedFullId: string | null,
): string[] => {
  if (!matchedFullId) return [];
  return items.flatMap((group) => collectExpandedIds(group, matchedFullId));
};
