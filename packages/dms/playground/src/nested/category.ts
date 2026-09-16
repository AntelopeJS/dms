import { Category } from "@antelopejs/interface-dms/page";
import { internalsSection } from "../sections";

export const nestedCategory = Category("nested", {
  displayName: "Nested Categories",
  icon: "i-ph-folders",
  order: 0,
  category: internalsSection,
});

export const level2ACategory = Category("level-2a", {
  displayName: "Level 2A",
  icon: "i-ph-folder",
  order: 0,
  category: nestedCategory,
});

export const level2BCategory = Category("level-2b", {
  displayName: "Level 2B",
  icon: "i-ph-folder",
  order: 1,
  category: nestedCategory,
});

export const level3BCategory = Category("level-3b", {
  displayName: "Level 3B",
  icon: "i-ph-folder-open",
  order: 1,
  category: level2BCategory,
});
