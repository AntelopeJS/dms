import { Category, RootCategory } from "@antelopejs/interface-dms/page";

// The playground files its demos under its own "Library" root instead of the
// core `pagesCategory`, whose "Pages" label every DMS project keeps. Like the
// Pages root it uses `urlSlug: "/"`, so it adds no URL segment. Its id starts
// the playground pages' permission ids (`library.form.form-simple`, ...).
export const libraryCategory = RootCategory("library", {
  displayName: "Library",
  icon: "i-ph-books",
  order: 1,
  urlSlug: "/",
});

// Thematic section headings that organize the library. Each section uses
// `urlSlug: "/"` so it stays transparent in page URLs
// (e.g. /grid/layout-grid-simple, not /layout/grid/layout-grid-simple).
// The library reads from the building blocks to the plumbing: design system,
// layout, then the page components (table view 30, form 40, charts 50, in
// their own category.ts), dynamic navigation (70), system and internals.

// Every component built or reworked for the v2 design: the themed Nuxt UI
// primitives, the generic DMS Vue components (foundations) and the blocks a
// page author places from the backend.
export const designSystemSection = Category("design-system", {
  displayName: "Design system",
  icon: "i-ph-palette",
  order: 10,
  category: libraryCategory,
  type: "label",
  urlSlug: "/",
});

export const layoutSection = Category("layout", {
  displayName: "Layout",
  icon: "i-ph-layout",
  order: 20,
  category: libraryCategory,
  type: "label",
  urlSlug: "/",
});

export const systemSection = Category("system", {
  displayName: "System",
  icon: "i-ph-gear",
  order: 80,
  category: libraryCategory,
  type: "label",
  urlSlug: "/",
});

export const internalsSection = Category("internals", {
  displayName: "Internals",
  icon: "i-ph-test-tube",
  order: 90,
  category: libraryCategory,
  type: "label",
  urlSlug: "/",
});
