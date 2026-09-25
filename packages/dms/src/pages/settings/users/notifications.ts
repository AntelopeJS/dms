import {
  Controller,
  Delete,
  Get,
  JSONBody,
  Parameter,
  Put,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { Model } from "@antelopejs/interface-database-decorators";
import {
  AuthTenantMember,
  AuthUserWithPermission,
} from "@antelopejs/interface-dms/guards";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  UserNotificationPreferencesModel,
  UserNotificationsModel,
} from "../../../db";
import {
  getRegisteredCategories,
  getRegisteredSubjects,
  publishAllNotificationsRead,
  publishNotificationsRead,
} from "../../../implementations/dms-notifications";
import { userNotificationPreferencesSchema } from "../../../validation/user-notification-preferences.schema";
import { userCategory } from "./category";

@RegisterPage()
export class NotificationsSettingsController extends PageController(
  "notifications",
  {
    displayName: "$menu.notifications",
    category: userCategory,
    icon: "i-ph-bell",
    order: 2,
    description: "$page.settings.description.notifications",
  },
  FormPageLayout(),
) {
  static notificationsComponent = CustomComponent(
    "DmsSettingsNotifications",
  ).meta({
    name: "$menu.notifications",
    icon: "i-ph-bell",
  });

  @AuthUserWithPermission(
    NotificationsSettingsController.notificationsComponent,
  )
  declare user: User;
}

export class NotificationsApiController extends Controller(
  "/settings/user/notifications",
) {
  // A user's own notifications are not tenant data: the header bell polls
  // them on every page, including the billing page a blocked tenant needs.
  @AuthTenantMember({ bypassTenantAccessGate: true })
  declare user: User;

  @Get("/preferences")
  async getPreferences(
    @Model(UserNotificationPreferencesModel)
    preferencesModel: UserNotificationPreferencesModel,
  ) {
    const preferences = await preferencesModel.getOrCreatePreferences(
      this.user._id,
    );
    return preferences.preferences;
  }

  @Put("/preferences")
  async updatePreferences(
    @JSONBody() body: unknown,
    @Model(UserNotificationPreferencesModel)
    preferencesModel: UserNotificationPreferencesModel,
  ) {
    const preferences = assertValidation(body, (v) =>
      userNotificationPreferencesSchema.parse(v),
    );

    return preferencesModel.updatePreferences(this.user._id, preferences);
  }

  @Get("/categories")
  async getCategories() {
    const categories = getRegisteredCategories();
    const subjects = getRegisteredSubjects();
    return { categories, subjects };
  }

  @Get("/list")
  async getNotifications(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
    @Parameter("limit", "query") limitParam?: string,
    @Parameter("offset", "query") offsetParam?: string,
  ) {
    const limit = Number(limitParam) || 20;
    const offset = Number(offsetParam) || 0;
    return await notificationsModel.getByUserId(this.user._id, limit, offset);
  }

  @Get("/unread-count")
  async getUnreadCount(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    const count = await notificationsModel.countUnread(this.user._id);
    return { count };
  }

  @Get("/unread-preview")
  async getUnreadPreview(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    return await notificationsModel.getUnreadByUserId(this.user._id, 3);
  }

  @Put("/mark-read/:id")
  async markAsRead(
    @Parameter("id", "param") id: string,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    const notification = await notificationsModel.get(id);
    assert(notification, 404, "error.notification_not_found");
    assert(notification.userId === this.user._id, 403, "error.unauthorized");

    await notificationsModel.markAsRead(id);
    await publishNotificationsRead(this.user._id, [id]);

    return { success: true };
  }

  @Delete("/delete/:id")
  async deleteNotification(
    @Parameter("id", "param") id: string,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    const notification = await notificationsModel.get(id);
    assert(notification, 404, "error.notification_not_found");
    assert(notification.userId === this.user._id, 403, "error.unauthorized");

    await notificationsModel.delete(id);

    return { success: true };
  }

  @Put("/mark-all-read")
  async markAllAsRead(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    await notificationsModel.markAllAsRead(this.user._id);
    await publishAllNotificationsRead(this.user._id);

    return { success: true };
  }

  @Delete("/delete-all")
  async deleteAll(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    await notificationsModel.deleteAll(this.user._id);

    return { success: true };
  }
}
