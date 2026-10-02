import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { User } from "@antelopejs/interface-dms/auth/db/tables/users.table";
import type { NotificationTone } from "@antelopejs/interface-dms/notifications/types";

export const userNotificationsTableName = "user_notifications";

/** Serves a user's feed and unread count, which filter by user and sort by date. */
const USER_FEED_INDEX = "userId_createdAt";

@RegisterTable(userNotificationsTableName, CORE_SCHEMA_NAME)
export class UserNotification extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Index({ group: USER_FEED_INDEX })
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  @Field("string")
  declare icon: string;

  @Field("string")
  declare title: string;

  @Field("string")
  declare description: string;

  @Field("string")
  declare linkTo: string | null;

  @Field("any")
  declare params: Record<string, string | number> | null;

  /** Icon well colour set by the sender; null lets the list derive it from the read state. */
  @Field("string")
  declare tone: NotificationTone | null;

  @Index()
  @Field("boolean")
  declare isRead: boolean;

  @Field("boolean")
  declare isDismissed?: boolean;

  @Field("boolean")
  declare isIdempotent?: boolean;

  @Index()
  @Field("string")
  declare categoryId: string;

  @Index()
  @Field("string")
  declare subjectId: string;

  @Index()
  @Field("string")
  declare groupId: string | null;

  @CreationTime()
  @Index()
  @Index({ group: USER_FEED_INDEX })
  @Field("date")
  declare createdAt: Date;

  @UpdateTime()
  @Index()
  @Field("date")
  declare updatedAt: Date;
}
