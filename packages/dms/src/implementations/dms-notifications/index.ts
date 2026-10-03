import { createHash, randomUUID } from "node:crypto";
import { Logging } from "@antelopejs/interface-core/logging";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import type {
  NotificationCategoryInfo,
  NotificationData,
  NotificationSubjectInfo,
  ReadScope,
} from "@antelopejs/interface-dms/notifications/types";
import { UserNotificationPreferencesModel } from "../../db/models/userNotificationPreferences.model";
import {
  UserNotificationsModel,
  buildNewUserNotification,
} from "../../db/models/userNotifications.model";
import type { UserNotification } from "../../db/tables/userNotifications.table";
import { getRealtimeBroker } from "../../realtime/current";
import { buildUserNotificationTopic } from "../../realtime/registry";
import { runInBatches } from "../../utils/run-in-batches";
import {
  DUPLICATE_WINDOW_MS,
  duplicateIds,
  isWithinDuplicateWindow,
} from "./delivery-dedupe";
import { hasNotificationTitle } from "./delivery-guard";
import {
  categoryRegistry,
  isSubjectRegistered,
  subjectRegistry,
} from "./registry";

export * from "./registry";

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

async function publishNotificationEvent(
  userId: string,
  type: string,
  payload?: Record<string, unknown>,
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

export async function publishNotificationsRead(
  userId: string,
  ids: string[],
): Promise<void> {
  await publishNotificationEvent(userId, NOTIFICATION_READ_EVENT, { ids });
}

/** Tells the user's open tabs these notifications are unread again. */
export async function publishNotificationsUnread(
  userId: string,
  ids: string[],
): Promise<void> {
  await publishNotificationEvent(userId, NOTIFICATION_UNREAD_EVENT, { ids });
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
 * description, params and link) reached this user within the duplicate
 * window: in the window before, or in this one, where the database refuses
 * the second row.
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

export async function publishAllNotificationsRead(
  userId: string,
): Promise<void> {
  await publishNotificationEvent(userId, NOTIFICATION_ALL_READ_EVENT);
}

export namespace internal {
  /** Advertises durable per-recipient delivery to newer interface consumers. */
  export async function SupportsIdempotency(): Promise<boolean> {
    return true;
  }

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

  const buildPreferenceKey = (
    categoryId: string,
    subjectId: string,
  ): string => {
    return `${categoryId}:${subjectId}`;
  };

  async function canSendNotification(
    userId: string,
    categoryId: string,
    subjectId: string,
  ): Promise<boolean> {
    const isRegistered = isSubjectRegistered(categoryId, subjectId);

    if (!isRegistered) {
      return false;
    }

    const preferencesModel = GetModel(UserNotificationPreferencesModel);
    const preferences = await preferencesModel.getOrCreatePreferences(userId);
    const preferenceKey = buildPreferenceKey(categoryId, subjectId);
    return preferences.preferences?.[preferenceKey] ?? true;
  }

  export async function SendToUser(
    userId: string,
    data: NotificationData,
    groupId?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    if (!isDeliverable(data, `"${userId}"`)) return;

    const isAllowed = await canSendNotification(
      userId,
      data.subject.category.id,
      data.subject.id,
    );

    if (!isAllowed) {
      return;
    }

    // A keyed delivery is stored once per key already; any other is kept
    // from repeating itself within the duplicate window.
    const created =
      idempotencyKey !== undefined
        ? await GetModel(UserNotificationsModel).createIdempotently(
            userId,
            data,
            idempotencyKey,
            groupId,
          )
        : await storeUnlessDuplicate(userId, data, groupId);

    if (!created) return;
    await publishNotificationEvent(userId, NOTIFICATION_NEW_EVENT, {
      notification: created,
    });
  }

  export async function SendToUsers(
    userIds: string[],
    data: NotificationData,
    readScope: ReadScope = "individual",
    idempotencyKey?: string,
  ): Promise<void> {
    if (!isDeliverable(data, `list of ${userIds.length}`)) return;
    const groupId = buildGroupId(readScope, idempotencyKey);
    await sendToUsersWithGroupId(userIds, data, groupId, idempotencyKey);
  }

  async function sendToUsersWithGroupId(
    userIds: string[],
    data: NotificationData,
    groupId: string | undefined,
    idempotencyKey?: string,
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds)];

    await runInBatches(uniqueUserIds, NOTIFICATION_SEND_BATCH_SIZE, (userId) =>
      SendToUser(userId, data, groupId, idempotencyKey),
    );
  }

  export async function SendToRoles(
    roleIds: string[],
    data: NotificationData,
    readScope: ReadScope = "individual",
    idempotencyKey?: string,
  ): Promise<void> {
    if (roleIds.length === 0 || !isDeliverable(data, "roles")) {
      return;
    }

    const userIds = await collectUserIdsWithRoles(roleIds);

    if (userIds.length === 0) {
      return;
    }

    await SendToUsers(userIds, data, readScope, idempotencyKey);
  }

  async function collectUserIdsWithRoles(roleIds: string[]): Promise<string[]> {
    const targetRoleIds = new Set(roleIds);
    const memberModel = GetModel(TenantMemberModel, CROSS_INSTANCE);
    const userIds = new Set<string>();
    let offset = 0;
    while (true) {
      const members = await memberModel.table
        .slice(offset, offset + NOTIFICATION_RECIPIENT_PAGE_SIZE)
        .run();
      for (const member of members) {
        if (member.roleIds?.some((roleId) => targetRoleIds.has(roleId))) {
          userIds.add(member.userId);
        }
      }
      if (members.length < NOTIFICATION_RECIPIENT_PAGE_SIZE) break;
      offset += NOTIFICATION_RECIPIENT_PAGE_SIZE;
    }
    return Array.from(userIds);
  }

  export async function SendToAll(
    data: NotificationData,
    readScope: ReadScope = "individual",
    idempotencyKey?: string,
  ): Promise<void> {
    if (!isDeliverable(data, "everyone")) return;
    const userModel = GetModel(UserModel);
    const groupId = buildGroupId(readScope, idempotencyKey);
    let offset = 0;
    while (true) {
      const users = await userModel.table
        .slice(offset, offset + NOTIFICATION_RECIPIENT_PAGE_SIZE)
        .run();
      await sendToUsersWithGroupId(
        users.map((user) => user._id),
        data,
        groupId,
        idempotencyKey,
      );
      if (users.length < NOTIFICATION_RECIPIENT_PAGE_SIZE) break;
      offset += NOTIFICATION_RECIPIENT_PAGE_SIZE;
    }
  }
}
