import { Category } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "../sections";

// What a frontend module adds to the dashboard from its own Vue code: the
// chrome registries (side panel, widgets, command palette, header actions,
// links, page setup) and the contract a custom component receives. Like the
// library sections, it uses `urlSlug: "/"` and adds no URL segment.
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
