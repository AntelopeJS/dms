import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { notificationCategory } from "../category";
import { sentNotificationCount } from "../notification-api";

const NOTIFICATION_API = "/api/notification";

@RegisterPage()
export class PageNotificationTest extends PageController(
  "notification-test",
  {
    displayName: "Test Notifications",
    icon: "i-ph-bell-ringing",
    category: notificationCategory,
    order: 0,
    description:
      "Demonstrates: the Notification() builder and its delivery options (toUser, toRoles, broadcast, readScope, idempotencyKey, params). Send one and open the bell.",
  },
  FormPageLayout(),
) {
  // Its nav badge counts the notifications you sent yourself with it.
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
  }).navBadge({
    count: async (_ctx, user) => ({
      count: sentNotificationCount(user._id),
      tone: "primary",
    }),
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
      'broadcast({ readScope: "shared" }): one notification for every user; once one of them reads it, it is read for all',
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

  static idempotentForm = Form({
    title: "Idempotent delivery",
    description:
      "toUser(id, { idempotencyKey }): send twice with the same key, a single notification arrives",
    submitUrl: `${NOTIFICATION_API}/send-idempotent`,
    submitLabel: "Send with this key",
    kind: "action",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
    fields: [
      {
        id: "key",
        label: "Idempotency key",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "order-42-shipped",
        required: true,
      },
    ],
  });

  static paramsForm = Form({
    title: "Translated text with params",
    description:
      "Builder .params({ count: 3 }) fills the {count} of a translated title, in each reader's language",
    submitUrl: `${NOTIFICATION_API}/send-params`,
    submitLabel: "Send",
    kind: "action",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
    fields: [],
  });

  static rolesForm = Form({
    title: "Send to roles",
    description:
      "toRoles(roleIds) with every role of the workspace, under the playground's own notification subject (Settings › Notifications)",
    submitUrl: `${NOTIFICATION_API}/send-to-roles`,
    submitLabel: "Send to every role",
    kind: "action",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
    fields: [],
  });
}
