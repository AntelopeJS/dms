import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { notificationCategory } from "../category";

@RegisterPage()
export class PageNotificationTest extends PageController(
  "notification-test",
  {
    displayName: "Test Notifications",
    icon: "i-ph-bell-ringing",
    category: notificationCategory,
    order: 0,
    description: "Test the notification system by sending custom notifications",
  },
  FormPageLayout(),
) {
  static notificationForm = Form({
    title: "Send Custom Notification",
    description: "Fill in the form and submit to send yourself a notification",
    submitUrl: "/api/notification/send",
    submitLabel: "Send notification",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
    // Each submit sends a new notification: the fields empty once it is
    // sent, so a second Enter does not send the same one again.
    kind: "action",
    fieldsOrientation: "horizontal",
    fields: [
      {
        id: "title",
        label: "Notification Title",
        description: "The title of the notification",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter notification title...",
        }),
        required: true,
      },
      {
        id: "description",
        label: "Notification Description",
        description: "The description/body of the notification",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter notification description...",
        }),
        required: true,
      },
      {
        id: "icon",
        label: "Icon (Phosphor)",
        description: "Phosphor icon class (e.g., i-ph-bell)",
        type: new DefaultDataTypes.StringType({
          placeholder: "i-ph-bell",
        }),
      },
      {
        id: "linkTo",
        label: "Link URL",
        description: "Optional URL to navigate when clicking the notification",
        type: new DefaultDataTypes.StringType({
          placeholder: "/settings/user/profile",
        }),
      },
    ],
  });

  static dmsUpdateForm = Form({
    title: "DMS Update Notification",
    description: "Send a system notification about a DMS update",
    submitUrl: "/api/notification/send-dms-update",
    submitLabel: "Send DMS update",
    kind: "action",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
    fields: [
      {
        id: "title",
        label: "Title",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "DMS Update Notification",
      },
    ],
  });

  static hostingPromoForm = Form({
    title: "Hosting Promo Notification",
    description: "Send a promotional notification about hosting offers",
    submitUrl: "/api/notification/send-hosting-promo",
    submitLabel: "Send hosting promo",
    kind: "action",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
    fields: [
      {
        id: "title",
        label: "Title",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "Hosting Promo Notification",
      },
    ],
  });

  static broadcastAllForm = Form({
    title: "Broadcast to All (shared)",
    description:
      "Send a shared notification to all users - when one reads it, all see it as read",
    submitUrl: "/api/notification/broadcast-all",
    submitLabel: "Send broadcast",
    kind: "action",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
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
