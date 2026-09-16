import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab, TabVariant } from "@antelopejs/interface-dms/base/tab";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import {
  AxeOrientation,
  Color,
  Size,
} from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTabsVariants extends PageController("tabs-variants", {
  displayName: "Tab Variants",
  icon: "i-ph-sliders-horizontal",
  category: pageCategory,
  order: 30,
  description: "Different tab styles and orientations",
}) {
  static tabsPill = Tab({
    variant: TabVariant.pill,
    items: [
      {
        label: "Files",
        icon: "i-ph-file",
        slot: "files",
      },
      {
        label: "Components",
        icon: "i-ph-cube",
        slot: "components",
      },
      {
        label: "Database",
        icon: "i-ph-database",
        disabled: true,
        slot: "database",
      },
    ],
    color: Color.primary,
    size: Size.medium,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "files" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "components" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "database" },
    );

  static tabsLink = Tab({
    variant: TabVariant.link,
    items: [
      {
        label: "Overview",
        icon: "i-ph-house",
        slot: "overview",
      },
      {
        label: "Analytics",
        icon: "i-ph-chart-line",
        slot: "analytics",
      },
      {
        label: "Settings",
        icon: "i-ph-gear",
        slot: "settings",
      },
    ],
    color: Color.success,
    size: Size.large,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "overview" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "analytics" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "settings" },
    );

  static tabsVertical = Tab({
    orientation: AxeOrientation.vertical,
    variant: TabVariant.pill,
    items: [
      {
        label: "Profile",
        icon: "i-ph-user",
        slot: "profile",
      },
      {
        label: "Security",
        icon: "i-ph-shield",
        slot: "security",
      },
      {
        label: "Preferences",
        icon: "i-ph-sliders",
        slot: "preferences",
      },
    ],
    color: Color.info,
    size: Size.small,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "profile" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "security" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "preferences" },
    );

  static tabsMinimal = Tab({
    items: [
      {
        label: "Documentation",
        slot: "documentation",
      },
      {
        label: "API Reference",
        slot: "api",
      },
      {
        label: "Examples",
        slot: "examples",
      },
    ],
    color: Color.neutral,
    size: Size.medium,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "documentation" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "api" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "examples" },
    );

  static tabsColorful = Tab({
    variant: TabVariant.pill,
    items: [
      {
        label: "Production",
        icon: "i-ph-rocket",
        slot: "production",
      },
      {
        label: "Staging",
        icon: "i-ph-flask",
        slot: "staging",
      },
      {
        label: "Development",
        icon: "i-ph-code",
        slot: "development",
      },
    ],
    color: Color.success,
    size: Size.large,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "production" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "staging" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "development" },
    );

  static tabsCompact = Tab({
    variant: TabVariant.link,
    orientation: AxeOrientation.horizontal,
    items: [
      {
        label: "All",
        icon: "i-ph-list",
        slot: "all",
      },
      {
        label: "Active",
        icon: "i-ph-circle-fill",
        slot: "active",
      },
      {
        label: "Archived",
        icon: "i-ph-archive",
        slot: "archived",
      },
    ],
    color: Color.secondary,
    size: Size.tiny,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "all" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "active" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "archived" },
    );

  static tabsWorkflow = Tab({
    variant: TabVariant.pill,
    unmountOnHide: false, // Keep alive for workflow state
    items: [
      {
        label: "Step 1: Configure",
        icon: "i-ph-gear",
        slot: "configure",
      },
      {
        label: "Step 2: Review",
        icon: "i-ph-eye",
        slot: "review",
      },
      {
        label: "Step 3: Deploy",
        icon: "i-ph-upload",
        slot: "deploy",
      },
    ],
    color: Color.warning,
    size: Size.medium,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "configure" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "review" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "deploy" },
    );

  static tabsWithBadges = Tab({
    variant: TabVariant.pill,
    items: [
      {
        label: "Notifications",
        icon: "i-ph-bell",
        slot: "notifications",
        badge: 12,
      },
      {
        label: "Updates",
        icon: "i-ph-arrow-circle-up",
        slot: "updates",
        badge: "new",
      },
      {
        label: "Features",
        icon: "i-ph-sparkle",
        slot: "features",
        badge: { label: "beta", color: "info", variant: "soft" },
      },
      {
        label: "Documentation",
        icon: "i-ph-book",
        slot: "documentation",
        badge: { label: "v2.0", color: "warning", variant: "subtle" },
      },
      {
        label: "Settings",
        icon: "i-ph-gear-six",
        slot: "settings",
      },
    ],
    color: Color.primary,
    size: Size.medium,
  })
    .child(
      "notificationsTree",
      Tree({
        title: "Recent Notifications",
        description: "12 unread notifications",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "notifications" },
    )
    .child(
      "updatesTree",
      Tree({
        title: "Latest Updates",
        description: "New features and improvements",
        fetchUrl: "/api/tree/components",
        color: Color.success,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "updates" },
    )
    .child(
      "featuresTree",
      Tree({
        title: "Beta Features",
        description: "Try out experimental features",
        fetchUrl: "/api/tree/database",
        color: Color.info,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "features" },
    )
    .child(
      "documentationTree",
      Tree({
        title: "Documentation v2.0",
        description: "Updated documentation",
        fetchUrl: "/api/tree/files",
        color: Color.neutral,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "documentation" },
    )
    .child(
      "settingsTree",
      Tree({
        title: "Settings",
        description: "Application configuration",
        fetchUrl: "/api/tree/components",
        color: Color.neutral,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "settings" },
    );
}
