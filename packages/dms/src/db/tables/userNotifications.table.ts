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

export const userNotificationsTableName = "user_notifications";

@RegisterTable(userNotificationsTableName, CORE_SCHEMA_NAME)
export class UserNotification extends Table {
  @Field("string")
  declare _id: string;

  @Index()
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
  @Field("date")
  declare createdAt: Date;

  @UpdateTime()
  @Index()
  @Field("date")
  declare updatedAt: Date;
}
