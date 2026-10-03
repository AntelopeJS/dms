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

export const userNotificationPreferencesTableName =
  "user_notification_preferences";

@RegisterTable(userNotificationPreferencesTableName, CORE_SCHEMA_NAME)
export class UserNotificationPreferences extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  @Field("any")
  declare preferences: Record<string, boolean>;

  /**
   * When the user last opened the header bell. Its badge counts the unread
   * notifications created since; unset until the bell first opens.
   */
  @Field("date")
  declare notificationsSeenAt?: Date | null;

  @CreationTime()
  @Index()
  @Field("date")
  declare createdAt: Date;

  @UpdateTime()
  @Index()
  @Field("date")
  declare updatedAt: Date;
}
