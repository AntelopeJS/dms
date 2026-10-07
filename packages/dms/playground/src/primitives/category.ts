import { Category } from "@antelopejs/interface-dms/page";
import { designSystemSection } from "../sections";

// Nuxt UI primitives themed to the v2 design (layers/dms-layout theme).
export const primitivesCategory = Category("primitives", {
  displayName: "Primitives",
  icon: "i-ph-swatches",
  order: 0,
  category: designSystemSection,
});
