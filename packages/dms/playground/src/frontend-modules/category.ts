import { Category } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "../sections";

export const frontendModulesSection = Category("frontend-modules", {
  displayName: "Frontend modules",
  icon: "i-ph-puzzle-piece",
  order: 75,
  category: libraryCategory,
  type: "label",
  urlSlug: "/",
});

export const dashboardChromeCategory = Category("dashboard-chrome", {
  displayName: "Dashboard chrome",
  icon: "i-ph-app-window",
  order: 0,
  category: frontendModulesSection,
});

export const customComponentsCategory = Category("custom-components", {
  displayName: "Custom components",
  icon: "i-ph-brackets-curly",
  order: 10,
  category: frontendModulesSection,
});
