import type { SafeParseReturnType, ZodType, ZodTypeDef } from "zod";
import type { ExportJob } from "../../db/tables/exportJobs.table";

/** @internal */
export const DEFAULT_EXPORT_HISTORY_LIMIT = 20;

/**
 * The context `job` was started with, read back through `schema` from the
 * JSON its `json_context` column stores: `null` when it was started without
 * one.
 *
 * @internal
 */
export function readExportJobContext<TContext>(
  job: ExportJob,
  schema: ZodType<TContext, ZodTypeDef, unknown>,
): SafeParseReturnType<unknown, TContext> {
  return schema.safeParse(
    job.json_context ? JSON.parse(job.json_context) : null,
  );
}
