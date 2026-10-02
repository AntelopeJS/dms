import { RootCategory } from "@antelopejs/interface-dms/page";

// Demonstrates creating a brand-new top-level sidebar group alongside the
// built-in Pages / Modules / Settings categories. Order 0 opens the sidebar
// with it, above the playground's Library root (sections.ts).
export const examplesCategory = RootCategory("examples", {
  displayName: "Examples",
  icon: "i-ph-flask",
  order: 0,
});
