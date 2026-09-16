import type { NavigationMenuItem } from "@nuxt/ui";

/** Semantic look of a menu entry, mirroring `MenuItemVariant` in the backend. */
export type MenuItemVariant = "default" | "accent";

/** Semantic state dot of a menu entry, mirroring `MenuItemStatus` in the backend. */
export type MenuItemStatus = "success" | "warning" | "error" | "neutral";

/** Query parameters carried by a menu entry's link. */
export type MenuItemQuery = Record<string, string>;

/**
 * A menu entry link. Entries carrying query parameters (one page serving many
 * entries, e.g. `/project?project=<id>`) use the object form.
 */
export interface MenuItemTarget {
  path: string;
  query?: MenuItemQuery;
}

/**
 * Nuxt UI menu item enriched with the DMS registration fields: the registered
 * `fullId`, plus the semantic `variant` / `status` a page or a dynamic menu
 * provider declares. Nuxt UI forwards unknown keys untouched.
 */
export interface DmsMenuItem extends NavigationMenuItem {
  fullId?: string;
  variant?: MenuItemVariant;
  status?: MenuItemStatus;
}

/** The route a menu is highlighted against. */
export interface MenuRouteState {
  path: string;
  query: Record<string, unknown>;
}
