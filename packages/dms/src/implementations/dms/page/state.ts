import type {
  CategoryInfo,
  ModuleInfo,
  DynamicMenuProviderInfo,
  PageInfo,
} from "@antelopejs/interface-dms/page";
import type { SiteLayoutTree } from "./types";

export const categoriesByFullId: Record<string, CategoryInfo> = {};

export const navigationTree: SiteLayoutTree = {
  displayName: "",
  children: {},
  childrenOrders: [],
  id: "",
  fullId: "",
  fullSlug: "",
  category: undefined,
};

export const moduleRegistry: Record<string, ModuleInfo> = {};

export const dynamicMenuProviders: DynamicMenuProviderInfo[] = [];

export const nodeProviders = new WeakMap<object, DynamicMenuProviderInfo>();

export const nodeTargets = new WeakMap<object, PageInfo>();

export const HTTP_FORBIDDEN = 403;

export const ERROR_UNAUTHORIZED = "error.unauthorized";
