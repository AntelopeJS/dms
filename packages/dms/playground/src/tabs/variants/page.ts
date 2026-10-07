import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab, TabVariant } from "@antelopejs/interface-dms/base/tab";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
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
    .child("filesPanel", Placeholder({ label: "Files" }), {
      slot: "files",
    })
    .child("componentsPanel", Placeholder({ label: "Components" }), {
      slot: "components",
    })
    .child("databasePanel", Placeholder({ label: "Database" }), {
      slot: "database",
    });

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
    .child("overviewPanel", Placeholder({ label: "Overview" }), {
      slot: "overview",
    })
    .child("analyticsPanel", Placeholder({ label: "Analytics" }), {
      slot: "analytics",
    })
    .child("settingsPanel", Placeholder({ label: "Settings" }), {
      slot: "settings",
    });

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
    .child("profilePanel", Placeholder({ label: "Profile" }), {
      slot: "profile",
    })
    .child("securityPanel", Placeholder({ label: "Security" }), {
      slot: "security",
    })
    .child("preferencesPanel", Placeholder({ label: "Preferences" }), {
      slot: "preferences",
    });

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
    .child("documentationPanel", Placeholder({ label: "Documentation" }), {
      slot: "documentation",
    })
    .child("apiPanel", Placeholder({ label: "API Reference" }), {
      slot: "api",
    })
    .child("examplesPanel", Placeholder({ label: "Examples" }), {
      slot: "examples",
    });

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
    .child("productionPanel", Placeholder({ label: "Production" }), {
      slot: "production",
    })
    .child("stagingPanel", Placeholder({ label: "Staging" }), {
      slot: "staging",
    })
    .child("developmentPanel", Placeholder({ label: "Development" }), {
      slot: "development",
    });

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
    .child("allPanel", Placeholder({ label: "All" }), {
      slot: "all",
    })
    .child("activePanel", Placeholder({ label: "Active" }), {
      slot: "active",
    })
    .child("archivedPanel", Placeholder({ label: "Archived" }), {
      slot: "archived",
    });

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
    .child("configurePanel", Placeholder({ label: "Step 1: Configure" }), {
      slot: "configure",
    })
    .child("reviewPanel", Placeholder({ label: "Step 2: Review" }), {
      slot: "review",
    })
    .child("deployPanel", Placeholder({ label: "Step 3: Deploy" }), {
      slot: "deploy",
    });

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
    .child("notificationsPanel", Placeholder({ label: "Notifications" }), {
      slot: "notifications",
    })
    .child("updatesPanel", Placeholder({ label: "Updates" }), {
      slot: "updates",
    })
    .child("featuresPanel", Placeholder({ label: "Features" }), {
      slot: "features",
    })
    .child("documentationPanel", Placeholder({ label: "Documentation" }), {
      slot: "documentation",
    })
    .child("settingsPanel", Placeholder({ label: "Settings" }), {
      slot: "settings",
    });
}
