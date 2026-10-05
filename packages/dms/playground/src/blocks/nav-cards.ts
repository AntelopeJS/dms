import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { NavCardGrid } from "@antelopejs/interface-dms/base";
import { blocksCategory } from "./category";

@RegisterPage()
export class PageBlocksNavCards extends PageController("blocks-nav-cards", {
  displayName: "Navigation cards",
  icon: "i-ph-cards",
  category: blocksCategory,
  order: 20,
  description:
    "NavCardGrid block: settings-style cards with live states and tags, module tiles with a readout, live data",
}) {
  static account = NavCardGrid({
    title: "Account",
    description: "Only you. These follow you across every workspace.",
    items: [
      {
        icon: "i-ph-user-circle",
        title: "Profile",
        description: "Name, avatar and the language of the dashboard.",
        to: "/settings/user/profile",
        state: "English (UK)",
      },
      {
        icon: "i-ph-shield-check",
        title: "Security",
        description:
          "Password, two-factor authentication and signed-in devices.",
        to: "/settings/user/security",
        state: "Backup codes not saved · 3 sessions",
        stateTone: "warning",
      },
      {
        icon: "i-ph-bell",
        title: "Notifications",
        description: "What you are told about, and your notification inbox.",
        to: "/settings/user/notifications",
        state: "3 unread · 16 of 19 on",
      },
      {
        icon: "i-ph-swatches",
        title: "Appearance",
        description: "Theme and interface density on this device.",
        to: "/settings/user/appearance",
        state: "Dark · Normal",
      },
      {
        icon: "i-ph-credit-card",
        title: "Billing",
        description: "Payment method, plan and the last 24 invoices.",
        to: "#billing",
        state: "Payment failed",
        stateTone: "error",
        tag: "SaaS",
      },
      {
        icon: "i-ph-book-open",
        iconTone: "neutral",
        title: "Documentation",
        description: "Guides and the API reference, on antelopejs.com.",
        to: "https://antelopejs.com/docs",
      },
    ],
  });

  static modules = NavCardGrid({
    title: "Modules",
    columns: 4,
    items: [
      {
        icon: "i-ph-shopping-cart",
        title: "Sales",
        to: "/modules",
        readout: ["✓ 1,284 orders this month", "→ 3 awaiting payment"],
        state: "Live",
        stateTone: "success",
      },
      {
        icon: "i-ph-database",
        title: "Database",
        to: "/modules",
        readout: ["✓ 42 tables · 1.9 GB", "→ backup 2 h ago"],
        state: "Live",
        stateTone: "success",
      },
      {
        icon: "i-ph-envelope-simple",
        iconTone: "warning",
        title: "Mailing",
        to: "/modules",
        readout: ["Campaigns, templates", "and deliverability."],
        state: "Soon",
        stateTone: "warning",
      },
      {
        icon: "i-ph-rocket-launch",
        iconTone: "muted",
        title: "Deployments",
        to: "/modules",
        readout: ["Staging → production", "promotion pipeline."],
        state: "Off",
      },
    ],
  });

  static live = NavCardGrid({
    title: "Workspace (live)",
    description: "Cards and their states come from /api/blocks/shortcuts.",
    fetchUrl: "/api/blocks/shortcuts",
    // The route answers 3 cards: the skeleton draws as many, on every width.
    skeletonCount: 3,
  });
}
