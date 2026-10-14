import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { dashboardChromeCategory } from "./category";

@RegisterPage()
export class PageChromeSidePanel extends PageController(
  "chrome-side-panel",
  {
    displayName: "Side panel",
    description:
      "A module docks its own panel on the right of every page with registerSidePanel. Open it from the header button or from the buttons below, then resize it and navigate: it stays mounted",
    icon: "i-ph-sidebar-simple",
    category: dashboardChromeCategory,
    order: 0,
  },
  DefaultLayout({}),
) {
  static guide = CustomComponent("ChromeSidePanelGuide");
}

@RegisterPage()
export class PageChromeSidebarWidgets extends PageController(
  "chrome-sidebar-widgets",
  {
    displayName: "Sidebar widgets",
    description:
      "Components a module mounts in the sidebar with useSidebarWidgets, above or below the search button. Collapse the sidebar to see them shrink, and open the demo module to see the module-scoped one",
    icon: "i-ph-sidebar",
    category: dashboardChromeCategory,
    order: 10,
  },
  DefaultLayout({}),
) {
  static guide = CustomComponent("ChromeSidebarWidgetsGuide");
}

@RegisterPage()
export class PageChromeAppWidgets extends PageController(
  "chrome-app-widgets",
  {
    displayName: "App widgets & overlays",
    description:
      "The framed widget dock in the bottom-left corner (useAppWidgets) and a free, self-positioned overlay (useAppOverlay). Add and remove both from this page, then hover the dock",
    icon: "i-ph-stack",
    category: dashboardChromeCategory,
    order: 20,
  },
  DefaultLayout({}),
) {
  static guide = CustomComponent("ChromeAppWidgetsGuide");
}

@RegisterPage()
export class PageChromeCommandPalette extends PageController(
  "chrome-command-palette",
  {
    displayName: "Command palette",
    description:
      "A module adds its own groups to Ctrl/Cmd+K (registerCommandPaletteSource) and an assistant mode (registerCommandPaletteAssistant). Open the palette, search 'pills' or press Tab",
    icon: "i-ph-command",
    category: dashboardChromeCategory,
    order: 30,
  },
  DefaultLayout({}),
) {
  static guide = CustomComponent("ChromeCommandPaletteGuide");
}

@RegisterPage()
export class PageChromeHeaderActions extends PageController(
  "chrome-header-actions",
  {
    displayName: "Header actions",
    description:
      "An icon button in the dashboard header (registerHeaderAction with onSelect, isActive, isVisible) and a button a component puts in its page header (usePageHeaderActions). Click both",
    icon: "i-ph-cursor-click",
    category: dashboardChromeCategory,
    order: 40,
  },
  DefaultLayout({}),
) {
  static guide = CustomComponent("ChromeHeaderActionsGuide");
}

@RegisterPage()
export class PageChromeLinks extends PageController(
  "chrome-links",
  {
    displayName: "Footer & sign-in links",
    description:
      "Links a module adds to the footer of the sign-in screens (registerFooterLink) and under the sign-in form (registerAuthLink). Open the sign-in page in a private window to see them",
    icon: "i-ph-link",
    category: dashboardChromeCategory,
    order: 50,
  },
  DefaultLayout({}),
) {
  static guide = CustomComponent("ChromeLinksGuide");
}
