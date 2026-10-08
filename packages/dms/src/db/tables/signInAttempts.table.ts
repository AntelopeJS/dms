import {
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { User } from "@antelopejs/interface-dms/auth/db/tables/users.table";

export const signInAttemptsTableName = "sign_in_attempts";

/**
 * `failed`: a wrong password. `alerted`: the user was told about a burst of
 * them. `reset_code`: a password-reset code was tried. `two_factor`: a code
 * was tried against a two-factor challenge. `two_factor_used`: a two-factor
 * challenge opened its session, and opens no other.
 */
export type SignInAttemptKind =
  | "failed"
  | "alerted"
  | "reset_code"
  | "two_factor"
  | "two_factor_used";

/**
 * Failed password attempts, password-reset and two-factor code tries, kept in
 * the database rather than in memory so every instance behind a load balancer
 * counts the same burst.
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
