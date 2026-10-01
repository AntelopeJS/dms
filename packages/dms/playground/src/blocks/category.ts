import { Category } from "@antelopejs/interface-dms/page";
import { designSystemSection } from "../sections";

// Display blocks a page author places from the builder: stat strips, key /
// value lists, navigation cards, empty states, banners and cards.
export const blocksCategory = Category("blocks", {
  displayName: "Blocks",
  icon: "i-ph-cube",
  order: 20,
  category: designSystemSection,
});
