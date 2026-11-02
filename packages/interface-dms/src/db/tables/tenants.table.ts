import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "../../constants";

export const tenantsTableName = "tenants";

@RegisterTable(tenantsTableName, CORE_SCHEMA_NAME)
export class Tenant extends Table {
  @Field("string")
  declare _id: string;

  @Field("string")
  declare name: string;

  /** True while default tenant provisioning must be retried. Absent means provisioned. */
  @Field("boolean")
  declare provisioningPending?: boolean;

  /** The process holding the provisioning lease. Empty means the lease is free. */
  @Field("string")
  declare provisioningHolder?: string | null;

  /**
   * Replaced by every claim, renewal and release of the provisioning lease, so
   * a holder that stopped is one whose token stopped changing. Undeclared
   * because a first claim expects it absent, which PostgreSQL cannot tell apart
   * from null on a declared column.
   */
  declare provisioningRevision?: string;

  @CreationTime()
  @Index()
  @Field("date")
  declare createdAt: Date;

  @UpdateTime()
  @Index()
  @Field("date")
  declare updatedAt: Date;
}
