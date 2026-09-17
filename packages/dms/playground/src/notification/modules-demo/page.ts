import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import {
  NotificationCategory,
  NotificationSubject,
} from "@antelopejs/interface-dms/notifications";
import { notificationCategory } from "../category";

export const moduleOneCategory = NotificationCategory("module-one", {
  labelKey: "dms.notifications.categories.module_one",
  descriptionKey: "dms.notifications.categories.module_one_desc",
  icon: "i-ph-shield-check",
});

export const moduleOneAlertsSubject = NotificationSubject("module-one-alerts", {
  category: moduleOneCategory,
  labelKey: "dms.notifications.subjects.module_one_alerts",
  descriptionKey: "dms.notifications.subjects.module_one_alerts_desc",
  togglePermission: "forbidden",
});

export const moduleOneUpdatesSubject = NotificationSubject(
  "module-one-updates",
  {
    category: moduleOneCategory,
    labelKey: "dms.notifications.subjects.module_one_updates",
    descriptionKey: "dms.notifications.subjects.module_one_updates_desc",
    togglePermission: "forbidden",
  },
);

export const moduleTwoCategory = NotificationCategory("module-two", {
  labelKey: "dms.notifications.categories.module_two",
  descriptionKey: "dms.notifications.categories.module_two_desc",
  icon: "i-ph-truck",
});

export const moduleTwoNotificationsSubject = NotificationSubject(
  "module-two-notifications",
  {
    category: moduleTwoCategory,
    labelKey: "dms.notifications.subjects.module_two_notifications",
    descriptionKey: "dms.notifications.subjects.module_two_notifications_desc",
    togglePermission: "forbidden",
  },
);

@RegisterPage()
export class PageModulesDemo extends PageController(
  "modules-demo",
  {
    displayName: "Modules Demo",
    icon: "i-ph-puzzle-piece",
    category: notificationCategory,
    order: 10,
    description: "Demonstrate notification categories from external modules",
  },
  FormPageLayout(),
) {
  static securityForm = Form({
    title: "Security Alert",
    description: "Simulate a security alert notification",
    submitUrl: "/api/notification/module-one",
    submitUrlMethod: HttpMethod.post,
    fields: [
      {
        id: "trigger",
        label: "Trigger",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "Suspicious login attempt detected",
      },
    ],
  });

  static logisticsForm = Form({
    title: "Logistics Update",
    description: "Simulate a logistics notification",
    submitUrl: "/api/notification/module-two",
    submitUrlMethod: HttpMethod.post,
    fields: [
      {
        id: "trigger",
        label: "Trigger",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "Package shipped from warehouse",
      },
    ],
  });

  static broadcastAllForm = Form({
    title: "Broadcast to All (shared)",
    description:
      "Send a shared notification to all users - when one reads it, all see it as read",
    submitUrl: "/api/notification/broadcast-all",
    submitUrlMethod: HttpMethod.post,
    fields: [
      {
        id: "trigger",
        label: "Trigger",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "System announcement",
      },
    ],
  });
}
