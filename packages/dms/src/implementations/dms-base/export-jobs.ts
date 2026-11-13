import type {
  ExportJobTicket,
  RunExportJobOptions,
  runExportJobProxy as RunExportJobDeclaration,
} from "@antelopejs/interface-dms/base/export-jobs";
import { runExportJob } from "../../utils";

export { getDeliverer, getExporter } from "../../utils";
export {
  downloadExportJob as downloadExportJobProxy,
  getExportJobStatus as getExportJobStatusProxy,
  listExportJobs,
} from "../../utils";

type ErasedRunExportJobOptions = Parameters<typeof RunExportJobDeclaration>[0];

/**
 * The proxy erases the caller's context type on the way in. The engine only
 * carries `context` back to that caller's `generate`, so restoring the generic
 * shape here cannot hand a callback a context it did not declare.
 */
export function runExportJobProxy(
  options: ErasedRunExportJobOptions,
): Promise<ExportJobTicket> {
  // SAFETY: Holds when options come through the interface's runExportJob<TContext>, whose RunExportJobOptions<TContext> types context and generate's context with one TContext; runExportJob hands generate options.context unchanged.
  return runExportJob(options as RunExportJobOptions);
}
