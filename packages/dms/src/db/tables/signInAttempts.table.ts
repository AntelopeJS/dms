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

/** `failed`: a wrong password. `alerted`: the user was told about a burst of them. */
export type SignInAttemptKind = "failed" | "alerted";

/**
 * Failed password attempts, kept in the database rather than in memory so
 * every instance behind a load balancer counts the same burst.
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

  @Index()
  @Field("date")
  declare createdAt: Date;
}
