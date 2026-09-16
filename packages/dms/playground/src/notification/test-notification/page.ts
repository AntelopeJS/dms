import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
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
    submitUrlMethod: HttpMethod.post,
    fieldsOrientation: "horizontal",
    fields: [
      {
        id: "title",
        label: "Notification Title",
        description: "The title of the notification",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter notification title...",
        }),
      },
      {
        id: "description",
        label: "Notification Description",
        description: "The description/body of the notification",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter notification description...",
        }),
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
    submitUrlMethod: HttpMethod.post,
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
    submitUrlMethod: HttpMethod.post,
    fields: [
      {
        id: "title",
        label: "Title",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "Hosting Promo Notification",
      },
    ],
  });
}
