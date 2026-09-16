import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "../../constants";
import { User } from "../../auth/db/tables/users.table";
import { Role } from "./roles.table";

export const tenantMembersTableName = "tenant_members";

@RegisterTable(tenantMembersTableName, TENANT_SCHEMA_NAME)
export class TenantMember extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  @Field(["string"])
  @Relation({ to: () => Role, many: true })
  declare roleIds: string[];

  @Field("boolean")
  declare isTenantOwner: boolean;

  /** Receipt tying this membership incarnation to its durable invite acceptance. */
  @Field("string")
  declare inviteDeliveryId?: string;

  @CreationTime()
  @Index()
  @Field("date")
  declare joinedAt: Date;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare invitedBy: string | null;
}
