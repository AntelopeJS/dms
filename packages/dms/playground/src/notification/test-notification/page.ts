import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { notificationCategory } from "../category";
import { sentNotificationCount } from "../notification-api";

const NOTIFICATION_API = "/api/notification";
const PRESET_COLUMNS = 2;

const PRESET_ITEMS = [
  {
    value: "dms-update",
    label: "DMS update",
    description: "To you: a tone, an icon and an internal link",
  },
  {
    value: "hosting-promo",
    label: "Hosting promo",
    description: "To you: a link that leaves the app",
  },
  {
    value: "broadcast",
    label: "Broadcast to all (shared)",
    description:
      'broadcast({ readScope: "shared" }): once one user reads it, it is read for all',
  },
  {
    value: "idempotent",
    label: "Idempotent delivery",
    description:
      "toUser(id, { idempotencyKey }): send it twice, a single notification arrives",
  },
  {
    value: "params",
    label: "Translated text with params",
    description:
      ".params({ count: 3 }) fills the {count} of a translated title, in each reader's language",
  },
  {
    value: "roles",
    label: "Every role",
    description:
      "toRoles(roleIds) with every role of the workspace, under the playground's own subject",
  },
];

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

  // One-click notifications: picking a card makes the action form ready to
  // send; it empties again once sent.
  static presetForm = Form({
    title: "Preset notifications",
    description:
      "Pick one, then send it. Each shows one option of the builder or of its delivery.",
    submitUrl: `${NOTIFICATION_API}/send-preset`,
    submitLabel: "Send",
    kind: "action",
    submitUrlMethod: HttpMethod.post,
    successMessage: "$demo.notifications.sent",
    fields: [
      {
        id: "preset",
        label: "Notification",
        type: new DefaultDataTypes.SelectType({
          items: PRESET_ITEMS,
          display: "cards",
          columns: PRESET_COLUMNS,
        }),
        required: true,
      },
    ],
  });
}
