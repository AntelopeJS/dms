import { Category } from "@antelopejs/interface-dms/page";
import { systemSection } from "../sections";

export const notificationCategory = Category("notification", {
  displayName: "Notifications",
  icon: "i-ph-bell",
  order: 10,
  category: systemSection,
});
