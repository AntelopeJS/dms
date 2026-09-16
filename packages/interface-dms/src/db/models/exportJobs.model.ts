import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { ExportStatus } from "../../base/types";
import { ExportJob, exportJobsTableName } from "../tables/exportJobs.table";

interface NewExportJobInput {
  jobId: string;
  userId: string;
  scope: string;
  context: unknown;
  filename: string;
  extension: string;
  contentType: string;
  delivery: string;
  deliveryPath?: string;
  retainUntilExpiry: boolean;
}

const COMPLETED_PROGRESS = 100;
const CREATED_AT_INDEX = "createdAt";
const USER_ID_INDEX = "userId";
const FIRST_RECORD_OFFSET = 0;

export class ExportJobModel extends BasicDataModel(
  ExportJob,
  exportJobsTableName,
) {
  async createNewJob(input: NewExportJobInput): Promise<void> {
    const now = new Date();
    await this.insert({
      _id: input.jobId,
      userId: input.userId,
      scope: input.scope,
      json_context: JSON.stringify(input.context ?? null),
      filename: input.filename,
      extension: input.extension,
      contentType: input.contentType,
      delivery: input.delivery,
      deliveryPath: input.deliveryPath,
      retainUntilExpiry: input.retainUntilExpiry,
      status: ExportStatus.pending,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async listForUser(
    userId: string,
    scope: string | undefined,
    limit: number,
  ): Promise<ExportJob[]> {
    const query = this.table.getAll(userId, USER_ID_INDEX);
    const scoped =
      scope === undefined
        ? query
        : query.filter((record) => record.key("scope").eq(scope));
    const records = await scoped
      .orderBy(CREATED_AT_INDEX, "desc")
      .slice(FIRST_RECORD_OFFSET, limit)
      .run();
    return records
      .map((record) => ExportJobModel.fromDatabase(record))
      .filter((record): record is ExportJob => record !== undefined);
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    await this.update(jobId, {
      progress,
      updatedAt: new Date(),
    });
  }

  async markAsCompleted(
    jobId: string,
    resultPath: string,
    result?: unknown,
  ): Promise<void> {
    await this.update(jobId, {
      status: ExportStatus.completed,
      progress: COMPLETED_PROGRESS,
      resultPath,
      json_result: result === undefined ? undefined : JSON.stringify(result),
      updatedAt: new Date(),
    });
  }

  /** Retains an uploaded object for cleanup when export completion fails. */
  async markAsFailed(
    jobId: string,
    error: unknown,
    resultPath?: string,
  ): Promise<void> {
    const patch: Partial<ExportJob> = {
      status: ExportStatus.failed,
      error: error instanceof Error ? error.message : JSON.stringify(error),
      updatedAt: new Date(),
    };
    if (resultPath !== undefined) patch.resultPath = resultPath;
    await this.update(jobId, patch);
  }
}
