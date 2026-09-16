import { Category, pagesCategory } from "@antelopejs/interface-dms/page";

export const pageCategory = Category("tree", {
  displayName: "Tree",
  icon: "i-ph-tree-structure",
  order: 20,
  category: pagesCategory,
});
