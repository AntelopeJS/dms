export type MenuItemType = "label" | "link";
// MenuItemVariant / MenuItemStatus / MenuItemQuery live in dms-core, the layer
// that renders them: this one only consumes them.

export interface PageValidation {
  requiredQueryParams?: string[];
  customFunctionId?: string;
}

export interface MenuOptions {
  displayName: string;
  category: CategoryInfo;
  urlSlug?: string;
  description?: string;
  order?: number;
  icon?: string;
  hidden?: boolean;
  publicAccess?: boolean;
  permission?: string;
  type?: MenuItemType;
  validation?: PageValidation;
  setupId?: string;
  query?: MenuItemQuery;
  variant?: MenuItemVariant;
  status?: MenuItemStatus;
  bypassTenantAccessGate?: boolean;
}

export interface CategoryInfo extends Omit<MenuOptions, "category"> {
  id: string;
  fullId: string;
  fullSlug: string;
  hasAccess?: boolean;
  isModuleRoot?: boolean;
}

// Mirror of ModuleInfo and MODULE_URL_PREFIX from @antelopejs/interface-dms/page.
// The frontend module cannot import backend types directly, so any change to the
// backend definitions must be reflected here (and vice versa).
export interface ModuleInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  landingPage?: string;
  defaultCategory?: {
    displayName?: string;
    icon?: string;
    order?: number;
    urlSlug?: string;
  };
}

export type ModuleWithAccess = ModuleInfo & { hasAccess: boolean };

export const MODULE_URL_PREFIX = "/modules";

export interface PageInfo extends Omit<CategoryInfo, "category"> {
  layoutUrl: string;
}

export type SiteLayoutTree = Omit<PageInfo, "layoutUrl"> & {
  children: Record<string, SiteLayoutTree>;
  childrenOrders: string[];
  layoutUrl?: string;
  hasAccess?: boolean;
};
export type SiteLayout = {
  pages: Record<string, PageInfo>;
  categories: Record<string, CategoryInfo>;
};

export interface QuickActionCategoryInfo {
  id: string;
  displayName: string;
  icon?: string;
  order?: number;
}

export type QuickActionTarget =
  | { type: "navigate"; to: string; query?: Record<string, string> }
  | { type: "openForm"; to: string; component: string }
  | { type: "event"; name: string; payload?: unknown };

/**
 * The payload only ever carries actions the caller can run: the server leaves
 * the others out entirely, so there is no access flag to read here.
 */
export interface QuickActionInfo {
  id: string;
  category: QuickActionCategoryInfo;
  displayName: string;
  icon: string;
  order?: number;
  target: QuickActionTarget;
}

export interface QuickActionsPayload {
  categories: Record<string, QuickActionCategoryInfo>;
  actions: Record<string, QuickActionInfo>;
}

export interface ComponentChild<T = object> {
  id: string;
  component: ComponentInfo<T>;
  slot?: string;
  [key: string]: unknown;
}

export interface ComponentInfo<T = object> {
  componentName?: string;
  options?: T;
  children?: ComponentChild<T>[];
}

export interface ResolvedComponentInfo<T = object> {
  id: string;
  options?: T;
  component: unknown;
  componentName?: string;
  children: ResolvedComponentInfo[];
  slot?: string;
  [key: string]: unknown;
}

export interface PageLayout {
  components: Record<string, ComponentInfo>;
  layout: ComponentInfo;
}
