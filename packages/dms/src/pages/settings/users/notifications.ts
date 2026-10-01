import {
  Controller,
  Delete,
  Get,
  JSONBody,
  Parameter,
  Put,
  Route,
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
import type { NotificationSubjectInfo } from "@antelopejs/interface-dms/notifications/types";
import {
  UserNotificationPreferencesModel,
  UserNotificationsModel,
} from "../../../db";
import {
  findSubjectByPreferenceKey,
  getRegisteredCategories,
  getRegisteredSubjects,
  isSubjectLocked,
  publishAllNotificationsRead,
  publishNotificationsRead,
  publishNotificationsUnread,
} from "../../../implementations/dms-notifications";
import {
  notificationIdsSchema,
  userNotificationPreferencesPatchSchema,
  userNotificationPreferencesSchema,
} from "../../../validation/user-notification-preferences.schema";
import { userCategory } from "./category";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const UNREAD_PREVIEW_SIZE = 3;
const UNREAD_FILTER = "unread";
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/** A registered subject as the settings screen lists it. */
export interface NotificationSubjectView extends NotificationSubjectInfo {
  /** The user may not turn this subject off. */
  locked: boolean;
}

function toSubjectView(
  subject: NotificationSubjectInfo,
): NotificationSubjectView {
  return { ...subject, locked: isSubjectLocked(subject) };
}

function parsePageSize(value?: string): number {
  const size = Number(value) || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
}

function parseOffset(value?: string): number {
  return Math.max(Number(value) || 0, 0);
}

/** Refuses keys that name no registered subject, and turning a locked subject off. */
function assertChangesAllowed(changes: Record<string, boolean>): void {
  for (const [key, enabled] of Object.entries(changes)) {
    const subject = findSubjectByPreferenceKey(key);
    assert(subject, HTTP_BAD_REQUEST, "error.request_refused");
    assert(
      enabled || !isSubjectLocked(subject),
      HTTP_FORBIDDEN,
      "error.forbidden",
    );
  }
}

@RegisterPage()
export class NotificationsSettingsController extends PageController(
  "notifications",
  {
    displayName: "$menu.notifications",
    category: userCategory,
    icon: "i-ph-bell",
    order: 2,
    description: "$page.settings.notifications.description",
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

  /** Replaces the whole map. Kept for existing clients; the settings screen saves per subject through PATCH. */
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

  /**
   * Saves some subjects and leaves the others untouched: one key for a
   * subject switch, every key of a category for its master switch. Returns
   * the whole stored map.
   */
  @Route("handler", "patch", "/preferences")
  async patchPreferences(
    @JSONBody() body: unknown,
    @Model(UserNotificationPreferencesModel)
    preferencesModel: UserNotificationPreferencesModel,
  ) {
    const changes = assertValidation(body, (v) =>
      userNotificationPreferencesPatchSchema.parse(v),
    );
    assertChangesAllowed(changes);

    return preferencesModel.mergePreferences(this.user._id, changes);
  }

  @Get("/categories")
  async getCategories() {
    const categories = getRegisteredCategories();
    const subjects = getRegisteredSubjects().map(toSubjectView);
    return { categories, subjects };
  }

  /** One page of the feed, newest first; `filter=unread` keeps unread rows only. */
  @Get("/list")
  async getNotifications(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
    @Parameter("limit", "query") limitParam?: string,
    @Parameter("offset", "query") offsetParam?: string,
    @Parameter("filter", "query") filterParam?: string,
  ) {
    return await notificationsModel.getByUserId(
      this.user._id,
      parsePageSize(limitParam),
      parseOffset(offsetParam),
      filterParam === UNREAD_FILTER,
    );
  }

  /** Totals of the All and Unread inbox tabs. */
  @Get("/counts")
  async getCounts(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    return await notificationsModel.countFeed(this.user._id);
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
    return await notificationsModel.getUnreadByUserId(
      this.user._id,
      UNREAD_PREVIEW_SIZE,
    );
  }

  @Put("/mark-read/:id")
  async markAsRead(
    @Parameter("id", "param") id: string,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    await this.assertOwnNotification(notificationsModel, id);

    await notificationsModel.markAsRead(id);
    await publishNotificationsRead(this.user._id, [id]);

    return { success: true };
  }

  @Put("/mark-unread/:id")
  async markAsUnread(
    @Parameter("id", "param") id: string,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    await this.assertOwnNotification(notificationsModel, id);

    await notificationsModel.markAsUnread(id);
    await publishNotificationsUnread(this.user._id, [id]);

    return { success: true };
  }

  /** Reopens several notifications at once: the undo of "mark all as read". */
  @Put("/mark-unread")
  async markManyAsUnread(
    @JSONBody() body: unknown,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    const { ids } = assertValidation(body, (v) =>
      notificationIdsSchema.parse(v),
    );

    const reopened = await notificationsModel.markManyAsUnread(
      this.user._id,
      ids,
    );
    await publishNotificationsUnread(this.user._id, reopened);

    return { success: true, ids: reopened };
  }

  @Delete("/delete/:id")
  async deleteNotification(
    @Parameter("id", "param") id: string,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    await this.assertOwnNotification(notificationsModel, id);

    await notificationsModel.delete(id);

    return { success: true };
  }

  /** Returns the ids it marked read, which `PUT /mark-unread` takes to undo it. */
  @Put("/mark-all-read")
  async markAllAsRead(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    const ids = await notificationsModel.markAllAsRead(this.user._id);
    await publishAllNotificationsRead(this.user._id);

    return { success: true, ids };
  }

  @Delete("/delete-all")
  async deleteAll(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    await notificationsModel.deleteAll(this.user._id);

    return { success: true };
  }

  private async assertOwnNotification(
    notificationsModel: UserNotificationsModel,
    id: string,
  ): Promise<void> {
    const notification = await notificationsModel.get(id);
    assert(notification, HTTP_NOT_FOUND, "error.notification_not_found");
    assert(
      notification.userId === this.user._id,
      HTTP_FORBIDDEN,
      "error.unauthorized",
    );
  }
}
