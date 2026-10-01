import { Category } from "@antelopejs/interface-dms/page";
import { designSystemSection } from "../sections";

// Live review of the generic Vue components of the dms-ui layer
// (layers/dms-ui/app/components), each with its props spelled out.
export const foundationsCategory = Category("foundations", {
  displayName: "Foundations",
  icon: "i-ph-shapes",
  order: 10,
  category: designSystemSection,
});
