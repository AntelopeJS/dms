import {
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const setupTokenTableName = "setup_token";

/**
 * The secret that proves a first registration comes from whoever deployed the
 * instance. At most one row exists, and only while the instance has no owner:
 * every replica reads the same value from here, and the registration that
 * creates the owner deletes it.
 */
@RegisterTable(setupTokenTableName, CORE_SCHEMA_NAME)
export class SetupToken extends Table {
  /** A fixed key, so the row can only be inserted once. */
  @Field("string") declare _id: string;

  @Field("string") declare token: string;

  @Field("date") declare createdAt: Date;
}
