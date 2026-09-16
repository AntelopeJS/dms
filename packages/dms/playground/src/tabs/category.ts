import { Category } from "@antelopejs/interface-dms/page";
import { layoutSection } from "../sections";

export const pageCategory = Category("tabs", {
  displayName: "Tabs",
  icon: "i-ph-tabs",
  order: 20,
  category: layoutSection,
});
