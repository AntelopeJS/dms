import { Category, pagesCategory } from "@antelopejs/interface-dms/page";

// Thematic section headings that organize the playground sidebar. Each
// section uses `urlSlug: "/"` so it stays transparent in page URLs
// (e.g. /grid/layout-grid-simple, not /layout/grid/layout-grid-simple).

// Every component built or reworked for the v2 design: the themed Nuxt UI
// primitives, the generic DMS Vue components (foundations) and the blocks a
// page author places from the backend.
export const designSystemSection = Category("design-system", {
  displayName: "Design system",
  icon: "i-ph-palette",
  order: 35,
  category: pagesCategory,
  type: "label",
  urlSlug: "/",
});

export const layoutSection = Category("layout", {
  displayName: "Layout",
  icon: "i-ph-layout",
  order: 40,
  category: pagesCategory,
  type: "label",
  urlSlug: "/",
});

export const systemSection = Category("system", {
  displayName: "System",
  icon: "i-ph-gear",
  order: 50,
  category: pagesCategory,
  type: "label",
  urlSlug: "/",
});

export const internalsSection = Category("internals", {
  displayName: "Internals",
  icon: "i-ph-test-tube",
  order: 90,
  category: pagesCategory,
  type: "label",
  urlSlug: "/",
});
