import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "../../../constants";
import { User } from "./users.table";

export const USER_EXTERNAL_IDENTITIES_TABLE_NAME = "user_external_identities";

/**
 * An identity a user owns on an external login provider (GitHub, Google, ...).
 *
 * The row id is the deterministic `<provider>:<providerAccountId>`, so the
 * primary key is what guarantees one row per provider account — the schema
 * layer offers no unique secondary index, and concurrent logins for the same
 * account must collide instead of duplicating (same pattern as
 * `TenantMember`).
 *
 * Scoped to authentication only: integrations that connect a provider for
 * product features (repository access, deployments) own their own storage and
 * must never be inferred from this table.
 */
@RegisterTable(USER_EXTERNAL_IDENTITIES_TABLE_NAME, CORE_SCHEMA_NAME)
export class UserExternalIdentity extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  /**
   * Provider identifier, as declared in the instance OAuth configuration.
   */
  @Field("string")
  declare provider: string;

  /**
   * Immutable account identifier on the provider side. Never the e-mail: users
   * change their provider e-mail without changing account.
   */
  @Field("string")
  declare providerAccountId: string;

  /**
   * E-mail reported by the provider at the last successful login, kept for
   * support and audit only. Account resolution never reads it back.
   */
  @Field("string")
  declare email: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Field("date")
  declare lastLoginAt: Date;
}
