import { Category } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "../sections";

export const pageCategory = Category("charts", {
  displayName: "Charts",
  icon: "i-ph-chart-line",
  order: 50,
  category: libraryCategory,
});
