import { Category, settingsCategory } from "@antelopejs/interface-dms/page";

export const userCategory = Category("user", {
  category: settingsCategory,
  displayName: "$page.settings.shell.account",
  description: "$page.settings.overview.account_description",
  urlSlug: "user",
  icon: "i-ph-users",
  order: 1,
  memberAccess: true,
});
