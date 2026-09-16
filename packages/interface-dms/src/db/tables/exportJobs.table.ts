import {
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "../../constants";
import type { ExportStatus } from "../../base/types";
import { User } from "../../auth/db/tables/users.table";

export const exportJobsTableName = "export_jobs";

@RegisterTable(exportJobsTableName, TENANT_SCHEMA_NAME)
export class ExportJob extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @Field("date")
  declare updatedAt: Date;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  /** Free-form identifier for the origin of the job (e.g. "table-view", "segment-owners"). */
  @Index()
  @Field("string")
  declare scope: string;

  /** Opaque scope-specific payload used for ACL or display. */
  @Field("string")
  declare json_context: string;

  @Field("string")
  declare filename: string;

  @Field("string")
  declare extension: string;

  @Field("string")
  declare contentType: string;

  @Field("string")
  declare delivery: string;

  /** Client-side path a delivered link points to. */
  @Field("string")
  declare deliveryPath?: string;

  /** Keeps the record and its stored file after a download, until expiry. */
  @Field("boolean")
  declare retainUntilExpiry: boolean;

  @Field("string")
  declare status: ExportStatus;

  @Field("number")
  declare progress: number;

  @Field("string")
  declare resultPath?: string;

  /** Serialized `ExportJobResultSummary` returned by the generator. */
  @Field("string")
  declare json_result?: string;

  @Field("string")
  declare error?: string;
}
