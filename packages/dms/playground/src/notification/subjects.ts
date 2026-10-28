import {
  NotificationCategory,
  NotificationSubject,
} from "@antelopejs/interface-dms/notifications";

export const PlaygroundNotificationCategory = NotificationCategory(
  "playground",
  {
    labelKey: "demo.notifications.category.label",
    descriptionKey: "demo.notifications.category.description",
    icon: "i-ph-flask",
    togglePermission: "default",
    tagKey: "demo.notifications.category.tag",
  },
);

export const PlaygroundSubject = NotificationSubject("playground-demo", {
  category: PlaygroundNotificationCategory,
  labelKey: "demo.notifications.subject.label",
  descriptionKey: "demo.notifications.subject.description",
  togglePermission: "allowed",
  badgeKey: "demo.notifications.subject.badge",
});
