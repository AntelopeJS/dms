import { Category } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "../sections";

export const pageCategory = Category("tree", {
  displayName: "Tree",
  icon: "i-ph-tree-structure",
  order: 60,
  category: libraryCategory,
});
