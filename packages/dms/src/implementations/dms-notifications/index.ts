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
import { UserNotificationsModel } from "../../db/models/userNotifications.model";
import { getRealtimeBroker } from "../../realtime/current";
import { buildUserNotificationTopic } from "../../realtime/registry";
import { runInBatches } from "../../utils/run-in-batches";
import {
  categoryRegistry,
  isSubjectRegistered,
  subjectRegistry,
} from "./registry";

export * from "./registry";

const NOTIFICATION_NEW_EVENT = "notification:new";
const NOTIFICATION_READ_EVENT = "notification:read";
const NOTIFICATION_ALL_READ_EVENT = "notification:all-read";
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
    const isAllowed = await canSendNotification(
      userId,
      data.subject.category.id,
      data.subject.id,
    );

    if (!isAllowed) {
      return;
    }

    const notificationsModel = GetModel(UserNotificationsModel);
    const created =
      idempotencyKey !== undefined
        ? await notificationsModel.createIdempotently(
            userId,
            data,
            idempotencyKey,
            groupId,
          )
        : await notificationsModel.create({
            userId,
            icon: data.icon,
            title: data.title,
            description: data.description,
            categoryId: data.subject.category.id,
            subjectId: data.subject.id,
            linkTo: data.linkTo,
            groupId,
            params: data.params,
          });

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
    if (roleIds.length === 0) {
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
