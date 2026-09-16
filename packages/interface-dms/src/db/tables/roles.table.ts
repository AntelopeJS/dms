import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "../../constants";

export const ROLES_TABLE_NAME = "roles";

@RegisterTable(ROLES_TABLE_NAME, TENANT_SCHEMA_NAME)
export class Role extends Table {
  /* 📅 Meta */
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @UpdateTime()
  @Field("date")
  declare updatedAt: Date;

  /* 🎭 Role information */
  @Index()
  @Field("string")
  declare name: string;

  /* 🔐 Permissions */
  @Field(["string"])
  declare permissions: string[];
}
