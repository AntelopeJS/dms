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
 * The latest sign-in email change a user asked for. It is pending while its
 * code is live: the account keeps its address until that code comes back.
 * Confirming, cancelling or burning the code closes it but keeps the row, so
 * the resend limits still see when, and to which address, a code last went.
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
  @Index()
  @Field("string")
  declare email: string;

  /**
   * Hash of the code sent to the new address; the code is never stored.
   * `null` once the change is closed.
   */
  @Field("string")
  declare codeHash: string | null;

  /** Codes tried against this one, right or wrong. */
  @Field("number")
  declare attempts: number;

  @Field("date")
  declare requestedAt: Date;
}
