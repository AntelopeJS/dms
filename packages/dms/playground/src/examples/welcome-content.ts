import type {
  KeyValueListItem,
  NavCardItem,
} from "@antelopejs/interface-dms/base";

// Copy and links of the welcome page, kept apart from its layout in page.ts.

const DMS_DOCS_URL = "https://dms.antelopejs.com/docs";
export const DMS_REPOSITORY_URL = "https://github.com/AntelopeJS/dms";

export const DOCS_LINKS = {
  quickstart: `${DMS_DOCS_URL}/getting-started/quickstart`,
  pages: `${DMS_DOCS_URL}/building/pages-and-components`,
  frontendLayer: `${DMS_DOCS_URL}/building/frontend-layer`,
  deployment: `${DMS_DOCS_URL}/building/deployment`,
};

/**
 * The demo areas built from the page DSL, each opening a representative demo,
 * in the order of the sidebar's Library section.
 */
export const BUILDING_BLOCK_CARDS: NavCardItem[] = [
  {
    icon: "i-ph-palette",
    title: "Design system",
    description:
      "The themed Nuxt UI primitives, the DMS foundations and every display block a page places from the backend.",
    to: "/foundations/foundations-labels",
    readout: ["Primitives · Foundations · Blocks"],
  },
  {
    icon: "i-ph-layout",
    title: "Layout",
    description:
      "Grid and stack layouts, tabs, drawers and modals, a flow canvas and pages that combine several components.",
    to: "/grid/layout-grid-simple",
  },
  {
    icon: "i-ph-table",
    title: "Table view",
    description:
      "Archive, kanban and card displays, expandable rows, density, drawer, modal and page editing, relations and custom row actions.",
    to: "/table-view/table-view-users",
  },
  {
    icon: "i-ph-note-pencil",
    title: "Forms",
    description:
      "Every field type, grouped and localized fields, address and profile forms, and watch actions that react as you type.",
    to: "/form/form-simple",
  },
  {
    icon: "i-ph-chart-line-up",
    title: "Charts",
    description:
      "A full dashboard, KPI and chart cards, top lists, realtime updates and the period selector that drives them.",
    to: "/charts/chart-dashboard",
  },
  {
    icon: "i-ph-tree-structure",
    title: "Tree",
    description:
      "Static and fetched trees with selection, colors, sizes and variants.",
    to: "/tree/tree-default",
  },
];

/** The dashboard around the demos: navigation, modules, settings, internals. */
export const DASHBOARD_CARDS: NavCardItem[] = [
  {
    icon: "i-ph-signpost",
    title: "Dynamic navigation",
    description:
      "Sidebar entries computed at request time, like a per-tenant list of projects.",
    to: "/dynamic-nav/new-project",
  },
  {
    icon: "i-ph-gear",
    title: "System & internals",
    description:
      "Notifications you can send yourself, deeply nested categories and page extensions.",
    to: "/notification/notification-test",
  },
  {
    icon: "i-ph-squares-four",
    title: "Modules",
    description:
      "The module home and the pages a demo module and a plain module contribute.",
    to: "/modules",
  },
  {
    icon: "i-ph-sliders-horizontal",
    title: "Settings",
    description:
      "Profile, language & region, security, notifications, appearance, members, invitations and roles, with Preview as role.",
    to: "/settings",
  },
];

/** The AntelopeJS products, in their own words, and where to host the DMS. */
export const ECOSYSTEM = {
  title: "The AntelopeJS ecosystem",
  description:
    "One ecosystem, three products, zero lock-in. Open source under Apache 2.0.",
  products: [
    {
      title: "AntelopeJS Framework",
      tagline: "Hexagonal architecture. Beyond your own code.",
      description:
        "A modular Node.js and TypeScript runtime: contracts, the modules that use them and the providers you pick when you assemble the app. The DMS is built on it.",
      icon: "i-ph-hexagon",
      accent: "blue",
      to: "https://framework.antelopejs.com",
      linkLabel: "framework.antelopejs.com",
    },
    {
      title: "AntelopeJS DMS",
      tagline: "Build your product. Not another back office.",
      description:
        "Tables, forms, charts, roles & permissions and audit trails. Code-first, developer-owned and self-hostable.",
      icon: "i-ph-squares-four",
      accent: "cyan",
      to: "https://dms.antelopejs.com",
      linkLabel: "dms.antelopejs.com",
      note: "You are here",
    },
    {
      title: "AntelopeJS Cloud",
      tagline: "Push code. We run the rest.",
      description:
        "Managed hosting for AntelopeJS apps and any Docker container: EU-hosted on dedicated hardware, with scale-to-zero.",
      icon: "i-ph-cloud",
      accent: "violet",
      to: "https://cloud.antelopejs.com",
      linkLabel: "cloud.antelopejs.com",
      note: "Coming soon",
    },
  ],
  hosting: {
    title: "Host it yourself, or let AntelopeJS Cloud run it",
    description:
      "The DMS runs on your own infrastructure today. AntelopeJS Cloud, coming soon, will deploy it from your antelope.config.ts on EU hardware, with your maximum bill known before you deploy.",
    icon: "i-ph-cloud-arrow-up",
    accent: "violet",
    actions: [
      {
        label: "Deployment guide",
        to: DOCS_LINKS.deployment,
        icon: "i-ph-book-open",
      },
      { label: "About AntelopeJS Cloud", to: "https://cloud.antelopejs.com" },
    ],
  },
};

/** A titled step of a numbered list. */
export interface WelcomeStep {
  label: string;
  description: string;
}

export const USAGE_STEPS: WelcomeStep[] = [
  {
    label: "Browse the sidebar",
    description:
      "Each entry is a live demo of one feature, with sample data you can change freely.",
  },
  {
    label: "Open the source next to the page",
    description:
      "Every page is a class under packages/dms/playground/src/<area>/: /table-view/table-view-users, for example, is table-view/users/page.ts.",
  },
  {
    label: "Jump anywhere with the command palette",
    description:
      "Ctrl K (⌘K on macOS) opens the command palette: search pages, actions and settings, or switch the theme.",
  },
  {
    label: "Switch theme and language",
    description:
      "Open the user menu at the bottom of the sidebar to change the theme or the dashboard language.",
  },
  {
    label: "See the dashboard as a role",
    description:
      "In Settings › Roles, Preview as role shows the pages and actions that role is allowed to see, without signing out.",
  },
  {
    label: "Sign in with your own account",
    description:
      "Use your own account: its roles decide which pages and actions you see.",
  },
];

export const RUNTIME_STEPS: WelcomeStep[] = [
  {
    label: "The backend registers the class",
    description:
      "@RegisterPage() files it under its category in the sidebar; its id is also its permission id.",
  },
  {
    label: "The DMS serves its layout",
    description:
      "Each static field becomes a block of the page layout, sent as JSON and filtered by the user's permissions.",
  },
  {
    label: "The frontend draws it",
    description:
      "Each block maps to a Vue component of a frontend layer. CustomComponent mounts your own, like the hero above.",
  },
];

/** Where each part of the playground lives, from packages/dms. */
export const SOURCE_MAP_ITEMS: KeyValueListItem[] = [
  {
    label: "Page classes",
    value: "playground/src/<area>/",
    type: "mono",
  },
  {
    label: "Sidebar sections",
    value: "playground/src/sections.ts",
    type: "mono",
  },
  {
    label: "Custom components",
    value: "playground/frontend-vue/app/components/",
    type: "mono",
  },
  {
    label: "DMS frontend layers",
    value: "frontend-vue/layers/",
    type: "mono",
  },
  {
    label: "Block builders",
    value: "../interface-dms/src/base/",
    type: "mono",
  },
  {
    label: "Frontend layers guide",
    value: "dms.antelopejs.com",
    type: "link",
    href: DOCS_LINKS.frontendLayer,
  },
];

/** How to report, propose and land a change. */
export const CONTRIBUTE_ITEMS: KeyValueListItem[] = [
  {
    label: "Report a bug",
    value: "GitHub issues",
    type: "link",
    href: `${DMS_REPOSITORY_URL}/issues`,
  },
  {
    label: "Propose a change",
    value: "Pull requests",
    type: "link",
    href: `${DMS_REPOSITORY_URL}/pulls`,
  },
  {
    label: "Commit titles",
    value: "Conventional Commits",
    type: "link",
    href: "https://www.conventionalcommits.org/",
  },
  {
    label: "Checks",
    value: "pnpm lint · pnpm typecheck · pnpm test",
    type: "mono",
  },
  {
    label: "Contributing guide",
    value: "CONTRIBUTING.md",
    type: "link",
    href: `${DMS_REPOSITORY_URL}/blob/main/CONTRIBUTING.md`,
  },
  {
    label: "Talk to the team",
    value: "Discord",
    type: "link",
    href: "https://discord.gg/kxzZMWqdFU",
  },
];

/** packages/dms/playground/src/table-view/users/page.ts, verbatim. */
export const PAGE_CLASS_SAMPLE = `import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { userDataAPI } from "../data-api";

@RegisterPage()
export class PageTableViewUsers extends PageController(
  "table-view-users",
  {
    displayName: "Users",
    icon: "i-ph-users",
    category: tableViewCategory,
    order: 140,
    description: "Users TableView used as relation target by Tasks.assignees",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(userDataAPI, {
    caption: "Users",
    labelKey: "name",
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      details: true,
      hasSelection: true,
    },
  });
}`;

export const RUN_LOCALLY_SAMPLE = `# Needs Node.js 22.18+, pnpm and MongoDB on localhost:27017 (or MONGO_URL)
git clone https://github.com/AntelopeJS/dms.git
cd dms
pnpm install

# Backend: builds the DMS and the playground, then serves the API
cd packages/dms
pnpm exec ajs project run -p playground

# Frontend, in a second terminal from the repository root
pnpm --dir packages/dms frontend:dev`;
