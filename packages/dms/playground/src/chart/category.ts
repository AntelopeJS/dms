import { Category, pagesCategory } from "@antelopejs/interface-dms/page";

export const pageCategory = Category("charts", {
  displayName: "Charts",
  icon: "i-ph-chart-line",
  order: 30,
  category: pagesCategory,
});
