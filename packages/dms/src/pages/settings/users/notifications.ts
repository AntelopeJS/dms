import {
  Context,
  Controller,
  Delete,
  Get,
  JSONBody,
  Parameter,
  Put,
  type RequestContext,
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
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types/button";
import { Section } from "@antelopejs/interface-dms/base/section";
import {
  type ConfirmDialogSerialized,
  serializeConfirmDialog,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import type { NotificationSubjectInfo } from "@antelopejs/interface-dms/notifications/types";
import {
  type UserNotificationCounts,
  UserNotificationPreferencesModel,
  UserNotificationsModel,
} from "../../../db";
import {
  isFilteredFeed,
  isNarrowedFeed,
  type NotificationFeedFilter,
  type NotificationReadState,
  parseNotificationFeedQuery,
} from "../../../db/models/notification-feed-filter";
import {
  findSubjectByPreferenceKey,
  getRegisteredCategories,
  getRegisteredSubjects,
  isSubjectLocked,
  publishAllNotificationsRead,
  publishNotificationsRead,
  publishNotificationsSeen,
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

// The inbox table's read-state tab filters on `isRead`: `filter_isRead=is:false`.
const INBOX_READ_FILTER_KEY = "filter_isRead";
const INBOX_READ_STATES: Record<string, NotificationReadState> = {
  "is:false": "unread",
  "is:true": "read",
};

/** The rows a read state lists, out of the feed's totals. */
const INBOX_TOTALS: Record<
  NotificationReadState | "all",
  (counts: UserNotificationCounts) => number
> = {
  all: (counts) => counts.all,
  unread: (counts) => counts.unread,
  read: (counts) => Math.max(counts.all - counts.unread, 0),
};

const INBOX_PAGE_SIZE = 20;
const NOTIFICATION_TEXTS = "$page.settings.notifications";

/**
 * The inbox of the notifications page: a read-only table over the user's own
 * feed, served by `GET /settings/user/notifications/inbox`. Its rows are drawn
 * by the `dms:inbox` display, grouped by day; All / Unread are its tabs.
 */
export function notificationInboxTable() {
  return TableView.fromSource({
    fetchUrl: "/settings/user/notifications/inbox",
    capabilities: { paginate: true, filter: true, sort: true, search: true },
    columns: {
      title: { name: "Title", type: new DefaultDataTypes.StringType() },
      isRead: {
        name: `${NOTIFICATION_TEXTS}.status_label`,
        type: new DefaultDataTypes.BooleanType(),
        filterable: true,
      },
      createdAt: { name: "Date", type: new DefaultDataTypes.DateType() },
    },
    layout: "compact",
    pagination: "infinite",
    pageSize: INBOX_PAGE_SIZE,
    displays: [
      {
        id: "dms:inbox",
        component: CustomComponent("DmsNotificationInboxDisplay"),
        capabilities: { search: false, sorting: false, filters: false },
      },
    ],
    defaultDisplay: "dms:inbox",
    tabs: [
      { id: "all", label: `${NOTIFICATION_TEXTS}.tab_all` },
      {
        id: "unread",
        label: `${NOTIFICATION_TEXTS}.tab_unread`,
        filter: { accessorKey: "isRead", mode: "is", value: "false" },
      },
    ],
    customButtons: [
      {
        id: "mark-all-read",
        label: `${NOTIFICATION_TEXTS}.mark_all_read`,
        icon: "i-ph-checks",
        variant: ButtonVariant.ghost,
        target: {
          type: "api",
          method: "PUT",
          url: "/settings/user/notifications/mark-all-read",
          successMessage: `${NOTIFICATION_TEXTS}.mark_all_read_done`,
        },
      },
      {
        id: "delete-all",
        label: `${NOTIFICATION_TEXTS}.delete_all`,
        icon: "i-ph-trash",
        variant: ButtonVariant.ghost,
        confirm: { from: "/settings/user/notifications/delete-all/confirm" },
        target: {
          type: "api",
          method: "DELETE",
          url: "/settings/user/notifications/delete-all",
          successMessage: `${NOTIFICATION_TEXTS}.delete_all_done`,
        },
      },
    ],
    emptyStates: {
      firstRun: {
        title: `${NOTIFICATION_TEXTS}.empty_title`,
        description: `${NOTIFICATION_TEXTS}.empty_description`,
        icon: "i-ph-bell-simple",
      },
      filtered: {
        title: `${NOTIFICATION_TEXTS}.empty_title`,
        description: `${NOTIFICATION_TEXTS}.empty_description`,
        icon: "i-ph-check-circle",
      },
    },
  });
}

/**
 * The inbox filter of a request: `q` (the search), `keys` (comma-separated
 * message keys whose translation matches it), `category`, `subject` and
 * `filter` (`unread` or `read`), all optional. Malformed or over-long
 * values are refused.
 */
function readFeedFilter(context: RequestContext): NotificationFeedFilter {
  const read = (name: string) =>
    context.url.searchParams.get(name) ?? undefined;
  const filter = parseNotificationFeedQuery({
    q: read("q"),
    keys: read("keys"),
    category: read("category"),
    subject: read("subject"),
    filter: read("filter"),
  });
  assert(filter, HTTP_BAD_REQUEST, "error.request_refused");
  return filter;
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

  static inbox = Section({
    title: `${NOTIFICATION_TEXTS}.inbox_title`,
    description: `${NOTIFICATION_TEXTS}.inbox_description`,
    card: false,
  }).child("table", notificationInboxTable());

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

  /**
   * One page of the feed, newest first, narrowed by the inbox filter (see
   * {@link readFeedFilter}); without one it lists the whole feed.
   */
  @Get("/list")
  async getNotifications(
    @Context() context: RequestContext,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
    @Parameter("limit", "query") limitParam?: string,
    @Parameter("offset", "query") offsetParam?: string,
  ) {
    return await notificationsModel.getFeedPage(
      this.user._id,
      readFeedFilter(context),
      parsePageSize(limitParam),
      parseOffset(offsetParam),
    );
  }

  /**
   * Totals of the All and Unread inbox tabs, for the feed the search,
   * category and subject narrow (the read state does not change them).
   * For the whole feed, `unseen` adds what the header bell counts: the
   * unread notifications that arrived since it was last opened.
   */
  @Get("/counts")
  async getCounts(
    @Context() context: RequestContext,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
    @Model(UserNotificationPreferencesModel)
    preferencesModel: UserNotificationPreferencesModel,
  ): Promise<UserNotificationCounts> {
    const filter = readFeedFilter(context);
    if (isNarrowedFeed(filter)) {
      return await notificationsModel.countFilteredFeed(this.user._id, filter);
    }
    const seenAt = await preferencesModel.getNotificationsSeenAt(this.user._id);
    const [counts, unseen] = await Promise.all([
      notificationsModel.countFeed(this.user._id),
      notificationsModel.countUnseen(this.user._id, seenAt),
    ]);
    return { ...counts, unseen };
  }

  /**
   * One page of the inbox table (`notificationInboxTable`), newest first:
   * the rows and how many its read-state tab lists.
   */
  @Get("/inbox")
  async getInbox(
    @Context() context: RequestContext,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
    @Parameter("limit", "query") limitParam?: string,
    @Parameter("offset", "query") offsetParam?: string,
  ) {
    const readState =
      INBOX_READ_STATES[
        context.url.searchParams.get(INBOX_READ_FILTER_KEY) ?? ""
      ];
    const [results, counts] = await Promise.all([
      notificationsModel.getFeedPage(
        this.user._id,
        readState ? { readState } : {},
        parsePageSize(limitParam),
        parseOffset(offsetParam),
      ),
      notificationsModel.countFeed(this.user._id),
    ]);
    return { results, total: INBOX_TOTALS[readState ?? "all"](counts) };
  }

  /** The dialog "Delete all" asks in, counting what it deletes. */
  @Get("/delete-all/confirm")
  async getDeleteAllConfirm(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ): Promise<ConfirmDialogSerialized> {
    const { all } = await notificationsModel.countFeed(this.user._id);
    return serializeConfirmDialog({
      title: `${NOTIFICATION_TEXTS}.delete_all_title`,
      description: `${NOTIFICATION_TEXTS}.delete_all_description`,
      params: { count: all },
      icon: "i-ph-trash",
      color: "error",
      confirmLabel: `${NOTIFICATION_TEXTS}.delete_all_confirm`,
      cancelLabel: `${NOTIFICATION_TEXTS}.cancel`,
    });
  }

  /** What the header bell counts on its own: see {@link getCounts}. */
  @Get("/unseen-count")
  async getUnseenCount(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
    @Model(UserNotificationPreferencesModel)
    preferencesModel: UserNotificationPreferencesModel,
  ) {
    const seenAt = await preferencesModel.getNotificationsSeenAt(this.user._id);
    const count = await notificationsModel.countUnseen(this.user._id, seenAt);
    return { count };
  }

  /**
   * The user opened the header bell: its badge resets, and counts again
   * what arrives later. Seeing is not reading: the notifications stay
   * unread until opened or marked read.
   */
  @Put("/seen")
  async markSeen(
    @Model(UserNotificationPreferencesModel)
    preferencesModel: UserNotificationPreferencesModel,
  ) {
    const seenAt = await preferencesModel.markNotificationsSeen(this.user._id);
    await publishNotificationsSeen(this.user._id, seenAt);

    return { success: true, seenAt };
  }

  /**
   * What the inbox search and filters work from: the message keys stored in
   * the user's feed (the client matches their translation) and the category
   * / subject pairs it holds.
   */
  @Get("/facets")
  async getFacets(
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    return await notificationsModel.getFeedFacets(this.user._id);
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

  /**
   * Marks the whole feed read, or only what the inbox filter keeps. Returns
   * the ids it marked read, which `PUT /mark-unread` takes to undo it.
   */
  @Put("/mark-all-read")
  async markAllAsRead(
    @Context() context: RequestContext,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    const filter = readFeedFilter(context);
    const ids = await notificationsModel.markAllAsRead(this.user._id, filter);
    // A filtered pass names its rows: "all read" would clear the others too.
    if (isFilteredFeed(filter)) {
      await publishNotificationsRead(this.user._id, ids);
    } else {
      await publishAllNotificationsRead(this.user._id);
    }

    return { success: true, ids };
  }

  /** Deletes the whole feed, or only what the inbox filter keeps. */
  @Delete("/delete-all")
  async deleteAll(
    @Context() context: RequestContext,
    @Model(UserNotificationsModel)
    notificationsModel: UserNotificationsModel,
  ) {
    await notificationsModel.deleteAll(this.user._id, readFeedFilter(context));

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
