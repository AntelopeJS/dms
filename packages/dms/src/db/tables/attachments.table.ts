import {
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const attachmentsTableName = "attachments";

@RegisterTable(attachmentsTableName, CORE_SCHEMA_NAME)
export class Attachment extends Table {
  @Field("string") declare _id: string;
  @Index() @Field("string") declare tenantId: string;
  @Field("string") declare storage: string;
  @Field("string") declare resourceKey: string;
  @Field("string") declare claimsJson: string;
}
