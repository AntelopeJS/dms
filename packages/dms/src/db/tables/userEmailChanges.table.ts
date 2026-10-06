import {
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { User } from "@antelopejs/interface-dms/auth/db/tables/users.table";

export const userEmailChangesTableName = "user_email_changes";

/**
 * A sign-in email change waiting for its new address to be proven: the
 * account keeps its address until the code sent there comes back.
 */
@RegisterTable(userEmailChangesTableName, CORE_SCHEMA_NAME)
export class UserEmailChange extends Table {
  /** The user's id: a user has one change pending at most. */
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  /** The address the account moves to once proven. */
  @Field("string")
  declare email: string;

  /** Hash of the code sent to the new address; the code is never stored. */
  @Field("string")
  declare codeHash: string;

  @Field("date")
  declare requestedAt: Date;
}
