import {
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { User } from "@antelopejs/interface-dms/auth/db/tables/users.table";

export const userKnownDevicesTableName = "user_known_devices";

/**
 * A browser and system a user already signed in from. Sessions alone cannot
 * tell: signing out or the expiry sweep deletes them, and the next sign-in
 * from the same browser would read as a new device.
 */
@RegisterTable(userKnownDevicesTableName, CORE_SCHEMA_NAME)
export class UserKnownDevice extends Table {
  /** Derived from the user and the fingerprint, so a device is stored once. */
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  /** Browser, system and device type, without versions: an update is not a new device. */
  @Field("string")
  declare fingerprint: string;

  @Field("date")
  declare firstSeenAt: Date;

  @Field("date")
  declare lastSeenAt: Date;
}
