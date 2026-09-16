import { Category } from "@antelopejs/interface-dms/page";
import { layoutSection } from "../sections";

export const stackCategory = Category("stack", {
  displayName: "Stack",
  icon: "i-ph-stack",
  order: 10,
  description: "HStack, VStack, and Spacer components inspired by SwiftUI",
  category: layoutSection,
});
