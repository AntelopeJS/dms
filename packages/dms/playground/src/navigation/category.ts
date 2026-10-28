import { Category } from "@antelopejs/interface-dms/page";
import { pagesSection } from "../sections";

export const dynamicNavigationCategory = Category("dynamic-nav", {
  displayName: "Dynamic Navigation",
  icon: "i-ph-tree-structure",
  order: 10,
  category: pagesSection,
});

export const DYNAMIC_NAVIGATION_PROJECT_SLUG = `${dynamicNavigationCategory.fullSlug}/project`;
export const DYNAMIC_NAVIGATION_DETAIL_SLUG = `${dynamicNavigationCategory.fullSlug}/projects/:projectId`;
export const DYNAMIC_NAVIGATION_OVERVIEW_URL = `${dynamicNavigationCategory.fullSlug}/overview`;
export const NAVIGATION_DEMO_API = "/api/playground/navigation";
