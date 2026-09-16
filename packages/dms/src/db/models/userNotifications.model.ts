import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";
import { runInBatches } from "../../utils/run-in-batches";
import { UserNotification, userNotificationsTableName } from "../tables";

const SHARED_GROUP_UPDATE_BATCH_SIZE = 10;

/**
 * One notification to store. Six of its ten fields are required strings,
 * several of them adjacent, where a swap at a call site read as a valid call.
 */
export interface NewUserNotification {
  userId: string;
  icon: string;
  title: string;
  description: string;
  categoryId: string;
  subjectId: string;
  linkTo?: string;
  groupId?: string;
  params?: Record<string, string | number>;
  /** Fixed row id, set only by an idempotent delivery, which the row records. */
  id?: string;
}

function matchesDelivery(
  existing: UserNotification,
  userId: string,
  data: NotificationData,
  groupId?: string,
): boolean {
  return (
    existing.isIdempotent === true &&
    isDeepStrictEqual(
      [
        existing.userId,
        existing.categoryId,
        existing.subjectId,
        existing.groupId,
        existing.icon,
        existing.title,
        existing.description,
        existing.linkTo,
        existing.params,
      ],
      [
        userId,
        data.subject.category.id,
        data.subject.id,
        groupId || null,
        data.icon,
        data.title,
        data.description,
        data.linkTo || null,
        data.params || null,
      ],
    )
  );
}

export class UserNotificationsModel extends BasicDataModel(
  UserNotification,
  userNotificationsTableName,
) {
  /** Returns visible notifications; dismissed keyed rows remain durable receipts. */
  async get(id: string): Promise<UserNotification | undefined> {
    const row = await super.get(id);
    return row?.isDismissed ? undefined : row;
  }

  /** Lists visible rows only. */
  async getAll(): Promise<UserNotification[]> {
    return (await super.getAll()).filter((row) => !row.isDismissed);
  }

  /** Queries visible rows by index. */
  async getBy(
    index: keyof UserNotification,
    ...keys: unknown[]
  ): Promise<UserNotification[]> {
    return (await super.getBy(index, ...keys)).filter(
      (row) => !row.isDismissed,
    );
  }

  async getByUserId(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<UserNotification[]> {
    let query = this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isDismissed").ne(true))
      .orderBy("createdAt", "desc");

    if (limit !== undefined && offset !== undefined) {
      query = query.slice(offset, offset + limit);
    }

    return query
      .run()
      .then((results) =>
        results
          .map((r) => UserNotificationsModel.fromDatabase(r))
          .filter((n): n is UserNotification => n !== undefined),
      );
  }

  async getUnreadByUserId(
    userId: string,
    limit?: number,
  ): Promise<UserNotification[]> {
    let query = this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isDismissed").ne(true))
      .filter((row) => row.key("isRead").eq(false))
      .orderBy("createdAt", "desc");

    if (limit) {
      query = query.slice(0, limit);
    }

    return query
      .run()
      .then((results) =>
        results
          .map((r) => UserNotificationsModel.fromDatabase(r))
          .filter((n): n is UserNotification => n !== undefined),
      );
  }

  async getBySubject(
    categoryId: string,
    subjectId: string,
  ): Promise<UserNotification[]> {
    return this.table
      .filter((row) => row.key("categoryId").eq(categoryId))
      .filter((row) => row.key("isDismissed").ne(true))
      .filter((row) => row.key("subjectId").eq(subjectId))
      .run()
      .then((results) =>
        results
          .map((r) => UserNotificationsModel.fromDatabase(r))
          .filter((n): n is UserNotification => n !== undefined),
      );
  }

  async countUnread(userId: string): Promise<number> {
    return this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isDismissed").ne(true))
      .filter((row) => row.key("isRead").eq(false))
      .count()
      .run();
  }

  async markAsRead(id: string): Promise<void> {
    const notification = await this.get(id);
    if (!notification) return;

    if (notification?.groupId) {
      await this.markSharedGroupAsRead(notification.groupId);
      return;
    }

    await this.table
      .get(id)
      .update({
        isRead: true,
        updatedAt: new Date(),
      })
      .run();
  }

  async markSharedGroupAsRead(groupId: string): Promise<void> {
    await this.table
      .getAll(groupId, "groupId")
      .filter((row) => row.key("isDismissed").ne(true))
      .filter((row) => row.key("isRead").eq(false))
      .update({
        isRead: true,
        updatedAt: new Date(),
      })
      .run();
  }

  async markAllAsRead(userId: string): Promise<void> {
    const notifications = await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isDismissed").ne(true))
      .filter((row) => row.key("isRead").eq(false))
      .run();

    if (notifications.length === 0) {
      return;
    }

    const uniqueGroupIds = [
      ...new Set(
        notifications
          .map((n) => n.groupId)
          .filter((id): id is string => id !== null && id !== undefined),
      ),
    ];

    await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isDismissed").ne(true))
      .filter((row) => row.key("isRead").eq(false))
      .update({
        isRead: true,
        updatedAt: new Date(),
      })
      .run();

    await runInBatches(
      uniqueGroupIds,
      SHARED_GROUP_UPDATE_BATCH_SIZE,
      (groupId) => this.markSharedGroupAsRead(groupId),
    );
  }

  /** Retains keyed notifications as receipts so dismissal cannot undo deduplication. */
  async delete(id: string): Promise<number> {
    const row = await this.get(id);
    if (!row) return 0;
    if (!row.isIdempotent) return super.delete(id);
    return this.table.get(id).update({ isDismissed: true }).run();
  }

  async deleteAll(userId: string): Promise<void> {
    await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isIdempotent").eq(true))
      .update({ isDismissed: true })
      .run();
    await this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isIdempotent").ne(true))
      .delete()
      .run();
  }

  /** Atomically inserts a delivery, returning undefined when the same event already exists. */
  async createIdempotently(
    userId: string,
    data: NotificationData,
    key: string,
    groupId?: string,
  ): Promise<UserNotification | undefined> {
    const id = `notification:${createHash("sha256")
      .update(JSON.stringify([key, userId]))
      .digest("hex")}`;
    try {
      return await this.create({
        userId,
        icon: data.icon,
        title: data.title,
        description: data.description,
        categoryId: data.subject.category.id,
        subjectId: data.subject.id,
        linkTo: data.linkTo,
        groupId,
        params: data.params,
        id,
      });
    } catch (error) {
      // A failed acknowledgement can follow a committed insert, independent of driver error codes.
      const existing = await this.table.get(id).run();
      if (!existing || !matchesDelivery(existing, userId, data, groupId))
        throw error;
      return undefined;
    }
  }

  async create({
    userId,
    icon,
    title,
    description,
    categoryId,
    subjectId,
    linkTo,
    groupId,
    params,
    id,
  }: NewUserNotification): Promise<UserNotification> {
    const notification: Partial<UserNotification> = {
      userId,
      icon,
      title,
      description,
      linkTo: linkTo || null,
      params: params || null,
      isRead: false,
      categoryId,
      subjectId,
      groupId: groupId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // A fixed id marks the row as the receipt of an idempotent delivery.
    if (id !== undefined) {
      notification._id = id;
      notification.isIdempotent = true;
    }

    const [createdId] = await this.table.insert(notification).run();
    const created = await super.get(createdId);

    if (!created) {
      throw new Error("Failed to create notification");
    }

    return created;
  }
}
