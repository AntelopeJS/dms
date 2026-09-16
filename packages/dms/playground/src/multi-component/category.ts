import { Category } from "@antelopejs/interface-dms/page";
import { layoutSection } from "../sections";

export const multiComponentCategory = Category("multi-component", {
  displayName: "Multi Component",
  icon: "i-ph-squares-four",
  order: 30,
  category: layoutSection,
});
