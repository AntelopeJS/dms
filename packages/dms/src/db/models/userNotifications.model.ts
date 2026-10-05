import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import type {
  NotificationData,
  NotificationTone,
} from "@antelopejs/interface-dms/notifications/types";
import { runInBatches } from "../../utils/run-in-batches";
import { UserNotification, userNotificationsTableName } from "../tables";
import {
  applyFeedFilter,
  applyUnseenFilter,
  type NotificationFeedFilter,
} from "./notification-feed-filter";

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
  tone?: NotificationTone;
  /** Fixed row id, set only by an idempotent delivery, which the row records. */
  id?: string;
  /**
   * Fixed row id the duplicate guard derives from the content and the time.
   * Unlike `id`, the row stays an ordinary notification: deleting it removes it.
   */
  duplicateId?: string;
}

/** Fields a sender may rewrite on a notification already delivered. */
export interface NotificationRewrite {
  /** A worded variant of the same message's title. */
  title?: string;
  params?: Record<string, string | number>;
  description?: string;
  tone?: NotificationTone;
}

const REPLACE_ROW = { conflict: "replace" } as const;

/** What a user's visible feed holds, for the inbox search and filters. */
export interface UserNotificationFacets {
  /** Message keys (without `$`) of the stored titles and descriptions. */
  messageKeys: string[];
  /** The category / subject pairs with at least one notification. */
  subjects: { categoryId: string; subjectId: string }[];
}

/** Read and unread totals of a user's visible feed. */
export interface UserNotificationCounts {
  all: number;
  unread: number;
  /** Unread notifications that arrived since the bell last opened (whole feed only). */
  unseen?: number;
}

/** Maps a delivery onto the row to store for one recipient. */
export function buildNewUserNotification(
  userId: string,
  data: NotificationData,
  groupId?: string,
): NewUserNotification {
  return {
    userId,
    icon: data.icon,
    title: data.title,
    description: data.description,
    categoryId: data.subject.category.id,
    subjectId: data.subject.id,
    linkTo: data.linkTo,
    groupId,
    params: data.params,
    tone: data.tone,
  };
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
        existing.tone ?? null,
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
        data.tone ?? null,
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

  private visibleFeed(userId: string) {
    return this.table
      .getAll(userId, "userId")
      .filter((row) => row.key("isDismissed").ne(true));
  }

  private unreadFeed(userId: string) {
    return this.visibleFeed(userId).filter((row) =>
      row.key("isRead").eq(false),
    );
  }

  /** Lists a user's feed, newest first; `unreadOnly` narrows it to unread rows. */
  async getByUserId(
    userId: string,
    limit?: number,
    offset?: number,
    unreadOnly = false,
  ): Promise<UserNotification[]> {
    const feed = unreadOnly
      ? this.unreadFeed(userId)
      : this.visibleFeed(userId);
    let query = feed.orderBy("createdAt", "desc");

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

  /** Totals behind the All and Unread tabs of the inbox. */
  async countFeed(userId: string): Promise<UserNotificationCounts> {
    const [all, unread] = await Promise.all([
      this.visibleFeed(userId).count().run(),
      this.countUnread(userId),
    ]);
    return { all, unread };
  }

  /**
   * One page of the inbox, newest first, narrowed by `filter` (read state,
   * category, subject, search). Every query starts from the user index.
   */
  async getFeedPage(
    userId: string,
    filter: NotificationFeedFilter,
    limit: number,
    offset: number,
  ): Promise<UserNotification[]> {
    const rows = await applyFeedFilter(this.visibleFeed(userId), filter)
      .orderBy("createdAt", "desc")
      .slice(offset, limit)
      .run();
    return rows
      .map((row) => UserNotificationsModel.fromDatabase(row))
      .filter((row): row is UserNotification => row !== undefined);
  }

  /** The All and Unread totals of the feed `filter` narrows, its read state aside. */
  async countFilteredFeed(
    userId: string,
    filter: NotificationFeedFilter,
  ): Promise<UserNotificationCounts> {
    const narrowed: NotificationFeedFilter = {
      ...filter,
      readState: undefined,
    };
    const [all, unread] = await Promise.all([
      applyFeedFilter(this.visibleFeed(userId), narrowed).count().run(),
      applyFeedFilter(this.unreadFeed(userId), narrowed).count().run(),
    ]);
    return { all, unread };
  }

  /** The message keys and category / subject pairs of the user's visible feed. */
  async getFeedFacets(userId: string): Promise<UserNotificationFacets> {
    const [titles, descriptions, categoryIds] = await Promise.all([
      this.visibleFeed(userId).distinct("title").run(),
      this.visibleFeed(userId).distinct("description").run(),
      this.visibleFeed(userId).distinct("categoryId").run(),
    ]);
    const subjects = await Promise.all(
      categoryIds.filter(Boolean).map(async (categoryId) => {
        const subjectIds = await this.visibleFeed(userId)
          .filter((row) => row.key("categoryId").eq(categoryId))
          .distinct("subjectId")
          .run();
        return subjectIds
          .filter(Boolean)
          .map((subjectId) => ({ categoryId, subjectId }));
      }),
    );
    const messageKeys = [...new Set([...titles, ...descriptions])]
      .filter((value) => typeof value === "string" && value.startsWith("$"))
      .map((value) => value.slice(1))
      .sort();
    return { messageKeys, subjects: subjects.flat() };
  }

  async getUnreadByUserId(
    userId: string,
    limit?: number,
  ): Promise<UserNotification[]> {
    let query = this.unreadFeed(userId).orderBy("createdAt", "desc");

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

  /**
   * The user's visible notifications with this title created after `since`
   * whose params hold every value of `match`, newest first. Lets a sender
   * fold a new event into the row an earlier one of the same kind left.
   */
  async findMatching(
    userId: string,
    title: string,
    match: Record<string, string | number>,
    since: Date,
  ): Promise<UserNotification[]> {
    // The title is compared here rather than in the query: a message key
    // starts with `$`, which the database reads as a field reference.
    const rows = await this.visibleFeed(userId)
      .filter((row) => row.key("createdAt").gt(since))
      .run();
    return rows
      .map((row) => UserNotificationsModel.fromDatabase(row))
      .filter((row): row is UserNotification => row?.title === title)
      .filter((row) =>
        Object.entries(match).every(
          ([key, value]) => row.params?.[key] === value,
        ),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  /**
   * Writes new params or a new description back, leaving the read state
   * and the dates alone. The whole row is replaced: an update reads a
   * string starting with `$`, as every message key does, as a field
   * reference.
   */
  async rewrite(
    row: UserNotification,
    changes: NotificationRewrite,
  ): Promise<void> {
    await this.table.insert(Object.assign({}, row, changes), REPLACE_ROW).run();
  }

  async countUnread(userId: string): Promise<number> {
    return this.unreadFeed(userId).count().run();
  }

  /**
   * What the header bell counts: the unread notifications created after
   * `seenAt`, when the user last opened it (all of them without a date).
   */
  async countUnseen(userId: string, seenAt?: Date): Promise<number> {
    return applyUnseenFilter(this.unreadFeed(userId), seenAt).count().run();
  }

  async markAsRead(id: string): Promise<void> {
    await this.setReadState(id, true);
  }

  /** Puts a notification back in the unread list; a shared copy reopens for its whole group. */
  async markAsUnread(id: string): Promise<void> {
    await this.setReadState(id, false);
  }

  private async setReadState(id: string, isRead: boolean): Promise<void> {
    const notification = await this.get(id);
    if (!notification) return;

    if (notification.groupId) {
      await this.setSharedGroupReadState(notification.groupId, isRead);
      return;
    }

    await this.table
      .get(id)
      .update({
        isRead,
        updatedAt: new Date(),
      })
      .run();
  }

  async markSharedGroupAsRead(groupId: string): Promise<void> {
    await this.setSharedGroupReadState(groupId, true);
  }

  private async setSharedGroupReadState(
    groupId: string,
    isRead: boolean,
  ): Promise<void> {
    await this.table
      .getAll(groupId, "groupId")
      .filter((row) => row.key("isDismissed").ne(true))
      .filter((row) => row.key("isRead").eq(!isRead))
      .update({
        isRead,
        updatedAt: new Date(),
      })
      .run();
  }

  /**
   * Marks the given notifications of one user unread again (the undo of
   * "mark all as read"). Ids of other users or of missing rows are skipped;
   * the ids actually reopened are returned.
   */
  async markManyAsUnread(userId: string, ids: string[]): Promise<string[]> {
    const reopened: string[] = [];
    await runInBatches(
      [...new Set(ids)],
      SHARED_GROUP_UPDATE_BATCH_SIZE,
      async (id) => {
        const notification = await this.get(id);
        if (notification?.userId !== userId || !notification.isRead) return;
        await this.markAsUnread(id);
        reopened.push(id);
      },
    );
    return reopened;
  }

  /**
   * Marks every unread notification of a user read, or only those `filter`
   * keeps, and returns their ids, so the change can be undone.
   */
  async markAllAsRead(
    userId: string,
    filter: NotificationFeedFilter = {},
  ): Promise<string[]> {
    const notifications = await applyFeedFilter(
      this.unreadFeed(userId),
      filter,
    ).run();

    if (notifications.length === 0) {
      return [];
    }

    const uniqueGroupIds = [
      ...new Set(
        notifications
          .map((n) => n.groupId)
          .filter((id): id is string => id !== null && id !== undefined),
      ),
    ];

    await applyFeedFilter(this.unreadFeed(userId), filter)
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

    return notifications.map((n) => n._id);
  }

  /** Retains keyed notifications as receipts so dismissal cannot undo deduplication. */
  async delete(id: string): Promise<number> {
    const row = await this.get(id);
    if (!row) return 0;
    if (!row.isIdempotent) return super.delete(id);
    return this.table.get(id).update({ isDismissed: true }).run();
  }

  /** Deletes every notification of a user, or only those `filter` keeps. */
  async deleteAll(
    userId: string,
    filter: NotificationFeedFilter = {},
  ): Promise<void> {
    await applyFeedFilter(this.table.getAll(userId, "userId"), filter)
      .filter((row) => row.key("isIdempotent").eq(true))
      .update({ isDismissed: true })
      .run();
    await applyFeedFilter(this.table.getAll(userId, "userId"), filter)
      .filter((row) => row.key("isIdempotent").ne(true))
      .delete()
      .run();
  }

  /**
   * Removes every row of a user, the dismissed receipts included: what
   * `deleteAll` keeps to block a repeat delivery has no one left to protect
   * once the account is gone.
   */
  async purgeUser(userId: string): Promise<void> {
    await this.table.getAll(userId, "userId").delete().run();
  }

  /**
   * Inserts a delivery under the duplicate guard's id, returning undefined
   * when an identical copy holds that id already. The database refuses the
   * second insert, so two instances sending together store one row.
   */
  async createUnlessDuplicate(
    notification: NewUserNotification,
    duplicateId: string,
  ): Promise<UserNotification | undefined> {
    try {
      return await this.create({ ...notification, duplicateId });
    } catch (error) {
      // A failed acknowledgement can follow a committed insert, as for createIdempotently.
      const existing = await this.table.get(duplicateId).run();
      if (!existing) throw error;
      return undefined;
    }
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
        ...buildNewUserNotification(userId, data, groupId),
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
    tone,
    id,
    duplicateId,
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
      tone: tone ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // A fixed id marks the row as the receipt of an idempotent delivery.
    if (id !== undefined) {
      notification._id = id;
      notification.isIdempotent = true;
    } else if (duplicateId !== undefined) {
      notification._id = duplicateId;
    }

    const [createdId] = await this.table.insert(notification).run();
    const created = await super.get(createdId);

    if (!created) {
      throw new Error("Failed to create notification");
    }

    return created;
  }
}
