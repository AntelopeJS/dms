import { Category, RootCategory } from "@antelopejs/interface-dms/page";

export const libraryCategory = RootCategory("library", {
  displayName: "Library",
  icon: "i-ph-books",
  order: 1,
  urlSlug: "/",
});

interface LibrarySection {
  displayName: string;
  icon: string;
  order: number;
}

function librarySection(id: string, section: LibrarySection) {
  return Category(id, {
    ...section,
    category: libraryCategory,
    type: "label",
    urlSlug: "/",
  });
}

/**
 * Every component built or reworked for the v2 design: the themed Nuxt UI
 * primitives, the generic DMS Vue components (foundations) and the blocks a
 * page author places from the backend.
 */
export const designSystemSection = librarySection("design-system", {
  displayName: "Design system",
  icon: "i-ph-palette",
  order: 10,
});

/** Grids, stacks, tabs, drawers and modals: how blocks are arranged. */
export const layoutSection = librarySection("layout", {
  displayName: "Layout",
  icon: "i-ph-layout",
  order: 20,
});

/** The data components: table view, form and charts. */
export const componentsSection = librarySection("components", {
  displayName: "Components",
  icon: "i-ph-squares-four",
  order: 30,
});

/**
 * What a page is made of besides its blocks: menus and categories, header
 * buttons, validation, access options and extensions.
 */
export const pagesSection = librarySection("pages", {
  displayName: "Pages & navigation",
  icon: "i-ph-signpost",
  order: 60,
});

/** The dashboard around every page: layout banners and quick actions. */
export const chromeSection = librarySection("chrome", {
  displayName: "Dashboard chrome",
  icon: "i-ph-app-window",
  order: 70,
});

/**
 * Backend services a module calls: notifications, realtime, hooks, invites,
 * permissions, tenancy and emails.
 */
export const systemSection = librarySection("system", {
  displayName: "System",
  icon: "i-ph-gear",
  order: 80,
});

/** Regression demos and plumbing with no better home. */
export const internalsSection = librarySection("internals", {
  displayName: "Internals",
  icon: "i-ph-test-tube",
  order: 90,
});
