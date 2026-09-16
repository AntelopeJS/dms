import { RootCategory } from "@antelopejs/interface-dms/page";

// Demonstrates creating a brand-new top-level sidebar group alongside the
// built-in Pages / Modules / Settings categories.
export const examplesCategory = RootCategory("examples", {
  displayName: "Examples",
  icon: "i-ph-flask",
  order: 4,
});
