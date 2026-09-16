import {
  BasicDataModel,
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { TenantMember } from "@antelopejs/interface-dms/db";
import { RelMember } from "../relation-key/database";

const tableName = "playground_rel_dms_assignments";

@RegisterTable(tableName, TENANT_SCHEMA_NAME)
export class RelDmsAssign extends Table {
  @Field("string") declare _id: string;
  @Field("string") declare label: string;
  @Field("string")
  @Relation({ to: () => TenantMember })
  declare member?: string;
  @Field("string")
  @Relation({ to: () => RelMember })
  declare synthMember?: string;
  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}
export class RelDmsAssignModel extends BasicDataModel(
  RelDmsAssign,
  tableName,
) {}
