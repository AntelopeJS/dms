import {
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { User } from "@antelopejs/interface-dms/auth/db/tables/users.table";
import { SignInAttemptKind } from "../../types";
export { SignInAttemptKind } from "../../types";

export const signInAttemptsTableName = "sign_in_attempts";

/**
 * Failed password attempts, password re-checks, password-reset and two-factor
 * code tries, kept in the database rather than in memory so every instance
 * behind a load balancer counts the same burst.
 */
@RegisterTable(signInAttemptsTableName, CORE_SCHEMA_NAME)
export class SignInAttempt extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  @Field("string")
  declare kind: SignInAttemptKind;

  /** Hash of the two-factor challenge a `two_factor` try or a use refers to. */
  @Field("string")
  declare challenge?: string;

  @Index()
  @Field("date")
  declare createdAt: Date;
}
