import { createHash, randomUUID } from "node:crypto";
import { Logging } from "@antelopejs/interface-core/logging";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import type {
  DeliveryOptions,
  NotificationCategoryInfo,
  NotificationChannelInfo,
  NotificationData,
  NotificationSubjectInfo,
  ReadScope,
  RoleSendOptions,
} from "@antelopejs/interface-dms/notifications/types";
import {
  UserNotificationPreferencesModel,
  type UserNotificationCounts,
  UserNotificationsModel,
  buildNewUserNotification,
} from "../../db/models";
import { userIdsHoldingAnyRole } from "../../db";
import type { UserNotification } from "../../db/tables";
import { getRealtimeBroker, buildUserNotificationTopic } from "../../realtime";
import { runInBatches } from "../../utils/run-in-batches/index";
import {
  categoryRegistry,
  channelRegistry,
  isChannelOn,
  isSubjectLocked,
  subjectRegistry,
} from "../../utils/notification-registry/index";
import {
  DUPLICATE_WINDOW_MS,
  duplicateIds,
  isWithinDuplicateWindow,
} from "./delivery-dedupe";
import { hasNotificationTitle } from "./delivery-guard";

export * from "../../utils/notification-registry/index";

const NOTIFICATION_NEW_EVENT = "notification:new";
const NOTIFICATION_READ_EVENT = "notification:read";
const NOTIFICATION_ALL_READ_EVENT = "notification:all-read";
const NOTIFICATION_UNREAD_EVENT = "notification:unread";
const NOTIFICATION_SEND_BATCH_SIZE = 20;
const NOTIFICATION_RECIPIENT_PAGE_SIZE = 500;

function buildGroupId(readScope: ReadScope, key?: string): string | undefined {
  if (readScope !== "shared") return undefined;
  return key === undefined
    ? randomUUID()
    : `notification-group:${createHash("sha256").update(key).digest("hex")}`;
}

type NotificationEventPayload =
  | { ids: string[]; counts: UserNotificationCounts }
  | { counts: UserNotificationCounts }
  | { notification: UserNotification };

async function publishNotificationEvent(
  userId: string,
  type: string,
  payload?: NotificationEventPayload,
): Promise<void> {
  try {
    await getRealtimeBroker().publish({
      topic: buildUserNotificationTopic(userId),
      type,
      payload,
      ts: Date.now(),
    });
  } catch (error) {
    Logging.Warn("Notifications: realtime publish failed", error);
  }
}

/**
 * Tells the user's open tabs these notifications are read, with the whole
 * feed's counts after it (`countFeedWithUnreadTone`): each tab takes its
 * badge from the event instead of asking for it.
 */
export async function publishNotificationsRead(
  userId: string,
  ids: string[],
  counts: UserNotificationCounts,
): Promise<void> {
  await publishNotificationEvent(userId, NOTIFICATION_READ_EVENT, {
    ids,
    counts,
  });
}

/** Tells the user's open tabs these notifications are unread again, with the feed's counts after it. */
export async function publishNotificationsUnread(
  userId: string,
  ids: string[],
  counts: UserNotificationCounts,
): Promise<void> {
  await publishNotificationEvent(userId, NOTIFICATION_UNREAD_EVENT, {
    ids,
    counts,
  });
}

/** Refuses a notification without a title, which would store an empty row. */
function isDeliverable(data: NotificationData, recipient: string): boolean {
  if (hasNotificationTitle(data)) return true;
  Logging.Error(
    `[DMS] Notification without a title not delivered (subject "${data.subject?.id}", recipient ${recipient})`,
  );
  return false;
}

/**
 * Stores a delivery unless the same notification (recipient, title,
 * description, params, link, category, subject, tone and icon) reached this
 * user within the duplicate window: in the window before, or in this one,
 * where the database refuses the second row.
 */
async function storeUnlessDuplicate(
  userId: string,
  data: NotificationData,
  groupId?: string,
): Promise<UserNotification | undefined> {
  const notificationsModel = GetModel(UserNotificationsModel);
  const now = new Date();
  const ids = duplicateIds(userId, data, now);
  const previous = await notificationsModel.get(ids.previous);
  const created =
    previous && isWithinDuplicateWindow(previous.createdAt, now)
      ? undefined
      : await notificationsModel.createUnlessDuplicate(
          buildNewUserNotification(userId, data, groupId),
          ids.current,
        );
  if (!created) {
    Logging.Debug(
      `[DMS] Notification "${data.title}" to "${userId}" skipped: the same one was sent less than ${DUPLICATE_WINDOW_MS / 1000}s ago`,
    );
  }
  return created;
}

/** How one delivery is stored. */
interface StoreOptions {
  groupId?: string;
  idempotencyKey?: string;
  /** Drop a repeat within the duplicate window. */
  dedupe: boolean;
}

async function store(
  userId: string,
  data: NotificationData,
  { groupId, idempotencyKey, dedupe }: StoreOptions,
): Promise<UserNotification | undefined> {
  const notificationsModel = GetModel(UserNotificationsModel);
  if (idempotencyKey !== undefined) {
    return notificationsModel.createIdempotently(
      userId,
      data,
      idempotencyKey,
      groupId,
    );
  }
  if (dedupe) return storeUnlessDuplicate(userId, data, groupId);
  return notificationsModel.create(
    buildNewUserNotification(userId, data, groupId),
  );
}

/**
 * Hands a stored notification to every registered channel the recipient has
 * on for its subject. A channel that throws is logged; the others still run
 * and the in-app delivery stands.
 */
async function deliverToChannels(
  userId: string,
  data: NotificationData,
  notification: UserNotification,
  preferences: () => Promise<Record<string, boolean>>,
  idempotencyKey?: string,
): Promise<void> {
  const subject = subjectRegistry.get(
    `${data.subject.category.id}:${data.subject.id}`,
  );
  const channels = [...channelRegistry.values()].filter(
    (channel) => subject?.channels?.[channel.id],
  );
  if (!subject || channels.length === 0) return;
  const stored = await preferences();
  for (const channel of channels) {
    if (!isChannelOn(subject, channel.id, stored)) continue;
    try {
      await channel.deliver(userId, data, {
        notificationId: notification._id,
        idempotencyKey,
      });
    } catch (error) {
      Logging.Error(
        `[DMS] Notification channel "${channel.id}" failed to deliver "${data.title}" to "${userId}"`,
        error,
      );
    }
  }
}

/** Tells the user's open tabs the whole feed is read, with its counts after it. */
export async function publishAllNotificationsRead(
  userId: string,
  counts: UserNotificationCounts,
): Promise<void> {
  await publishNotificationEvent(userId, NOTIFICATION_ALL_READ_EVENT, {
    counts,
  });
}

export namespace internal {
  export const RegisterNotificationCategory = {
    register: (info: NotificationCategoryInfo) => {
      const existing = categoryRegistry.get(info.id);

      if (existing) {
        return;
      }

      categoryRegistry.set(info.id, info);
    },
    unregister: (info: NotificationCategoryInfo) => {
      categoryRegistry.delete(info.id);
    },
  };

  export const RegisterNotificationChannel = {
    register: (info: NotificationChannelInfo) => {
      if (channelRegistry.has(info.id)) {
        Logging.Warn(
          `[DMS] Notification channel "${info.id}" registered again: the latest registration replaces the previous one`,
        );
      }
      channelRegistry.set(info.id, info);
    },
    unregister: (info: NotificationChannelInfo) => {
      channelRegistry.delete(info.id);
    },
  };

  export const RegisterNotificationSubject = {
    register: (info: NotificationSubjectInfo) => {
      if (!categoryRegistry.has(info.category.id)) {
        throw new Error(
          `Category "${info.category.id}" is not registered. Register the category before its subjects.`,
        );
      }

      const fullId = `${info.category.id}:${info.id}`;
      const existing = subjectRegistry.get(fullId);

      if (existing) {
        return;
      }

      subjectRegistry.set(fullId, info);
    },
    unregister: (info: NotificationSubjectInfo) => {
      subjectRegistry.delete(`${info.category.id}:${info.id}`);
    },
  };

  /** A user's stored preferences, read once per delivery and only when needed. */
  function preferencesReader(
    userId: string,
  ): () => Promise<Record<string, boolean>> {
    let read: Promise<Record<string, boolean>> | undefined;
    return () => {
      read ??= GetModel(UserNotificationPreferencesModel)
        .getOrCreatePreferences(userId)
        .then((stored) => stored.preferences ?? {});
      return read;
    };
  }

  async function canSendNotification(
    data: NotificationData,
    preferences: () => Promise<Record<string, boolean>>,
  ): Promise<boolean> {
    const preferenceKey = `${data.subject.category.id}:${data.subject.id}`;
    const subject = subjectRegistry.get(preferenceKey);
    if (!subject) return false;
    if (isSubjectLocked(subject)) return true;
    return (await preferences())[preferenceKey] ?? true;
  }

  export async function SendToUser(
    userId: string,
    data: NotificationData,
    groupId?: string,
    idempotencyKey?: string,
    delivery: DeliveryOptions = {},
  ): Promise<void> {
    if (!isDeliverable(data, `"${userId}"`)) return;

    const preferences = preferencesReader(userId);
    if (!(await canSendNotification(data, preferences))) return;

    const created = await store(userId, data, {
      groupId,
      idempotencyKey,
      dedupe: delivery.dedupe !== false,
    });

    if (!created) return;
    await publishNotificationEvent(userId, NOTIFICATION_NEW_EVENT, {
      notification: created,
    });
    await deliverToChannels(userId, data, created, preferences, idempotencyKey);
  }

  export async function SendToUsers(
    userIds: string[],
    data: NotificationData,
    readScope: ReadScope = "individual",
    idempotencyKey?: string,
    delivery: DeliveryOptions = {},
  ): Promise<void> {
    if (!isDeliverable(data, `list of ${userIds.length}`)) return;
    const groupId = buildGroupId(readScope, idempotencyKey);
    await sendToUsersWithGroupId(userIds, data, {
      groupId,
      idempotencyKey,
      dedupe: delivery.dedupe !== false,
    });
  }

  async function sendToUsersWithGroupId(
    userIds: string[],
    data: NotificationData,
    { groupId, idempotencyKey, dedupe }: StoreOptions,
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds)];

    await runInBatches(uniqueUserIds, NOTIFICATION_SEND_BATCH_SIZE, (userId) =>
      SendToUser(userId, data, groupId, idempotencyKey, { dedupe }),
    );
  }

  export async function SendToRoles(
    roleIds: string[],
    data: NotificationData,
    options: RoleSendOptions = {},
  ): Promise<void> {
    if (roleIds.length === 0 || !isDeliverable(data, "roles")) {
      return;
    }

    const userIds = await userIdsHoldingAnyRole(
      GetModel(TenantMemberModel, options.tenantId ?? CROSS_INSTANCE),
      roleIds,
    );

    if (userIds.length === 0) {
      return;
    }

    await SendToUsers(
      userIds,
      data,
      options.readScope,
      options.idempotencyKey,
      { dedupe: options.dedupe },
    );
  }

  export async function SendToAll(
    data: NotificationData,
    readScope: ReadScope = "individual",
    idempotencyKey?: string,
    delivery: DeliveryOptions = {},
  ): Promise<void> {
    if (!isDeliverable(data, "everyone")) return;
    const userModel = GetModel(UserModel);
    const groupId = buildGroupId(readScope, idempotencyKey);
    let offset = 0;
    while (true) {
      const users = await userModel.table
        .orderBy("_id")
        .slice(offset, NOTIFICATION_RECIPIENT_PAGE_SIZE)
        .pluck("_id")
        .run();
      await sendToUsersWithGroupId(
        users.map((user) => user._id),
        data,
        { groupId, idempotencyKey, dedupe: delivery.dedupe !== false },
      );
      if (users.length < NOTIFICATION_RECIPIENT_PAGE_SIZE) break;
      offset += NOTIFICATION_RECIPIENT_PAGE_SIZE;
    }
  }
}
