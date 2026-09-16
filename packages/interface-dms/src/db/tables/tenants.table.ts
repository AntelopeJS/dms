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

  @CreationTime()
  @Index()
  @Field("date")
  declare createdAt: Date;

  @UpdateTime()
  @Index()
  @Field("date")
  declare updatedAt: Date;
}
