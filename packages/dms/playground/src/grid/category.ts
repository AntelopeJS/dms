import { Category } from "@antelopejs/interface-dms/page";
import { layoutSection } from "../sections";

export const pageCategory = Category("grid", {
  displayName: "Grid",
  icon: "i-ph-grid-four",
  order: 0,
  category: layoutSection,
});
