import {
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "../../constants";

export const tenantLifecycleTableName = "tenant_lifecycle";

/** Permanent closure and active invocations share one atomic tenant-local revision. */
@RegisterTable(tenantLifecycleTableName, TENANT_SCHEMA_NAME)
export class TenantLifecycle extends Table {
  @Field("string") declare _id: string;
  @Field("string") declare revision: string;
  @Field("boolean") declare closed: boolean;
  @Field(["string"]) declare activeAttemptIds: string[];
}
