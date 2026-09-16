import { Category, settingsCategory } from "@antelopejs/interface-dms/page";

// On its own rather than in index.ts: the barrel re-exports every page in this
// directory and each page needs this category, so declaring it there made all
// seven of them import the barrel that imports them back.
export const userCategory = Category("user", {
  category: settingsCategory,
  displayName: "$menu.user_settings",
  urlSlug: "user",
  icon: "i-ph-users",
  order: 1,
});
