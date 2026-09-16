import { Category } from "@antelopejs/interface-dms/page";
import { systemSection } from "../sections";

export const notificationCategory = Category("notification", {
  displayName: "Notification",
  icon: "i-ph-bell",
  order: 0,
  category: systemSection,
});
