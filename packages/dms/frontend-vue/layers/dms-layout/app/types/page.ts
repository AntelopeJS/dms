import type { BlockText } from "#dms-core/app/types/composed-text";
import type { BlockAction } from "#dms-ui/app/build/components/blocks/BlockActions.vue";

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
  badge?: string;
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
  version?: string;
  catalogCategory?: string;
  defaultCategory?: {
    displayName?: string;
    icon?: string;
    order?: number;
    urlSlug?: string;
  };
}

export type ModuleWithAccess = ModuleInfo & { hasAccess: boolean };

// Mirror of ModuleStatus / ModuleReadoutLine from @antelopejs/interface-dms/page.
export type ModuleStatus = "live" | "beta" | "update" | "attention";
export type ModuleReadoutTone = "success" | "info" | "warning" | "error";
export interface ModuleReadoutLine {
  text: string;
  tone?: ModuleReadoutTone;
}

/**
 * One entry of `/dms/modules-listing`: the module's info plus what its
 * catalog hooks reported. `status` and `readout` are optional so a backend
 * predating the hooks still reads as live with no readout.
 */
export type ModuleCatalogEntry = ModuleWithAccess & {
  landingSlug: string;
  status?: ModuleStatus;
  readout?: ModuleReadoutLine[];
};

export const MODULE_URL_PREFIX = "/modules";

export interface PageInfo extends Omit<CategoryInfo, "category"> {
  layoutUrl: string;
}

export type SiteLayoutTree = Omit<PageInfo, "layoutUrl"> & {
  children: Record<string, SiteLayoutTree>;
  childrenOrders: string[];
  layoutUrl?: string;
  hasAccess?: boolean;
  /** The tone of a `badge` the server counted (`navBadge`); neutral when absent. */
  badgeTone?: MenuItemBadgeTone;
};
// Mirror of LayoutBannerVariant from @antelopejs/interface-dms/layout-banners.
export type LayoutBannerVariant = "info" | "warning" | "error";

/**
 * Mirror of the backend's serialized layout banner. The payload only carries
 * the banners whose visibility resolver passed for this request, so there is
 * nothing left to decide here but the user's own dismissals.
 */
export interface LayoutBanner {
  key: string;
  variant: LayoutBannerVariant;
  order: number;
  dismissible: boolean;
  icon?: string;
  /** A string (`$` for an i18n key) or a composed text. */
  text?: BlockText;
  /** Link buttons after the text; the last one leads. */
  actions?: BlockAction[];
  component?: string;
  props?: Record<string, unknown>;
}

export type SiteLayout = {
  pages: Record<string, PageInfo>;
  categories: Record<string, CategoryInfo>;
  /** Absent when the backend predates layout banners. */
  banners?: LayoutBanner[];
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
  | { type: "button"; to: string; component: string; button: string }
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
  /** The page declares components and the viewer may see none of them. */
  allComponentsHidden?: boolean;
}
