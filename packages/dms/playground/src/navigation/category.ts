import { Category, pagesCategory } from "@antelopejs/interface-dms/page";

// A heading group whose children are the sidebar's own entries, the shape a
// per-tenant list of projects takes: collapsed, they become the rail's icons.
export const dynamicNavigationCategory = Category("dynamic-nav", {
  displayName: "Dynamic Navigation",
  icon: "i-ph-tree-structure",
  order: 45,
  type: "label",
  category: pagesCategory,
});

export const DYNAMIC_NAVIGATION_PROJECT_SLUG = `${dynamicNavigationCategory.fullSlug}/project`;
