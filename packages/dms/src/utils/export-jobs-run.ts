// Running an export job: generation context, ownership, access and delivery of
// the produced file.
//
// Split out of export-jobs.ts.

import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { type User } from "@antelopejs/interface-dms/auth/db";
import { ExportStatus } from "@antelopejs/interface-dms/base/types";
import { ExportJobModel } from "@antelopejs/interface-dms/db/models/exportJobs.model";
import type { ExportJob } from "@antelopejs/interface-dms/db/tables/exportJobs.table";
import type {
  ExportJobAccessOptions,
  ExportJobStatus,
  ExportJobSummary,
  ExportJobTicket,
  ListExportJobsOptions,
  RunExportJobOptions,
} from "@antelopejs/interface-dms/base/export-jobs";
import {
  buildExportFilename,
  DEFAULT_DELIVERY,
  DEFAULT_EXPORT_HISTORY_LIMIT,
  deleteExportFromStorage,
  EXPORT_TTL_MS,
  getDeliverer,
  getExportLocalScratchPath,
  readJobResult,
  streamExportFromStorage,
  uploadExportToStorage,
} from "./export-jobs";

// The contract declares the vocabulary; re-exported so a caller inside the
// module reaches the whole export surface from one place.
export type {
  ExportJobAccessOptions,
  ExportJobGenerateContext,
  ExportJobOwnership,
  ExportJobStatus,
  ExportJobSummary,
  ExportJobTicket,
  ListExportJobsOptions,
  RunExportJobOptions,
} from "@antelopejs/interface-dms/base/export-jobs";
const DEFAULT_MAX_EXECUTION_TIME_MS = 10 * 60 * 1000;
const MIN_PROGRESS = 0;
const MAX_IN_PROGRESS = 99;

interface LoadedExportJob<TContext> {
  model: ExportJobModel;
  record: ExportJob;
  context: TContext;
}

function assertOwnership<TContext>(
  record: ExportJob,
  user: User,
  access?: ExportJobAccessOptions<TContext>,
): TContext {
  assert(record.userId === user._id, 403, "Export not accessible");
  if (access?.scope !== undefined) {
    assert(record.scope === access.scope, 403, "Export not accessible");
  }
  const context = record.json_context
    ? (JSON.parse(record.json_context) as TContext)
    : // The stored context is absent for jobs that carry none, and TContext has
      // no null in it. Widening the generic ripples through every caller of the
      // export-job helpers; left for that pass.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions
      (null as unknown as TContext);
  if (access?.isOwnedBy) {
    assert(
      access.isOwnedBy(record, context, user),
      403,
      "Export not accessible",
    );
  }
  return context;
}

interface ProcessedExportJob {
  jobId: string;
  tenantId: string;
  extension: string;
  contentType: string;
  maxExecutionTimeMs: number;
}

async function deliverExportJob(
  model: ExportJobModel,
  jobId: string,
  resourceKey: string,
): Promise<void> {
  const record = await model.get(jobId);
  if (!record) return;
  try {
    await getDeliverer(record.delivery).deliver(record, resourceKey);
  } catch (error) {
    // Delivery only notifies: the artifact is stored and stays reachable from
    // the job itself, so a failed e-mail must not fail a completed export.
    Logging.Error(`Export job ${jobId} delivery failed:`, error);
  }
}

async function processExportJob<TContext>(
  model: ExportJobModel,
  job: ProcessedExportJob,
  context: TContext,
  generate: RunExportJobOptions<TContext>["generate"],
): Promise<void> {
  const localPath = getExportLocalScratchPath(job.jobId, job.extension);
  // Set between a successful upload and the completion write, the window where
  // a stored object exists that no record points at yet.
  let uploadedResourceKey: string | undefined;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort(
      new Error(`Export exceeded ${job.maxExecutionTimeMs}ms`),
    );
  }, job.maxExecutionTimeMs);
  const throwIfAborted = (): void => {
    if (abortController.signal.aborted) {
      throw abortController.signal.reason ?? new Error("Export aborted");
    }
  };
  try {
    let lastProgressUpdate = 0;
    const reportProgress = async (progress: number): Promise<void> => {
      throwIfAborted();
      const clamped = Math.max(
        MIN_PROGRESS,
        Math.min(MAX_IN_PROGRESS, Math.floor(progress)),
      );
      if (clamped === lastProgressUpdate) return;
      lastProgressUpdate = clamped;
      await model.updateProgress(job.jobId, clamped);
    };
    const generatePromise = generate({
      jobId: job.jobId,
      tenantId: job.tenantId,
      localPath,
      context,
      reportProgress,
      signal: abortController.signal,
    });
    generatePromise.catch(() => undefined);
    const abortPromise = new Promise<never>((_, reject) => {
      abortController.signal.addEventListener(
        "abort",
        () =>
          reject(abortController.signal.reason ?? new Error("Export aborted")),
        { once: true },
      );
    });
    const result = await Promise.race([generatePromise, abortPromise]);
    throwIfAborted();
    const resourceKey = await uploadExportToStorage(
      localPath,
      job.tenantId,
      job.jobId,
      job.extension,
      job.contentType,
    );
    uploadedResourceKey = resourceKey;
    throwIfAborted();
    await model.markAsCompleted(job.jobId, resourceKey, result ?? undefined);
    // The record now points at the object: the sweep owns its lifetime.
    uploadedResourceKey = undefined;
    await deliverExportJob(model, job.jobId, resourceKey);
  } catch (error: unknown) {
    fs.rmSync(localPath, { force: true });
    // Mark first: a storage delete that hangs must not leave the job stuck in
    // `generating` — the record is what the requester polls.
    await model.markAsFailed(job.jobId, error, uploadedResourceKey);
    // The failed record retains the uploaded path if immediate cleanup fails.
    if (uploadedResourceKey) {
      await deleteExportFromStorage(uploadedResourceKey);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function runExportJob<TContext = unknown>(
  opts: RunExportJobOptions<TContext>,
): Promise<ExportJobTicket> {
  assert(opts.user, 401, "Authentication required");
  const tenantId = getRequestTenantId(opts.ctx);
  const model = GetModel(ExportJobModel, tenantId);

  const jobId = crypto.randomUUID();
  const delivery = opts.delivery ?? DEFAULT_DELIVERY;
  getDeliverer(delivery).validate?.({
    delivery,
    deliveryPath: opts.deliveryPath,
  });

  await model.createNewJob({
    jobId,
    userId: opts.user._id,
    scope: opts.scope,
    context: opts.context ?? null,
    filename: opts.filename,
    extension: opts.extension,
    contentType: opts.contentType,
    delivery,
    deliveryPath: opts.deliveryPath,
    retainUntilExpiry: opts.retainUntilExpiry ?? false,
  });

  processExportJob(
    model,
    {
      jobId,
      tenantId,
      extension: opts.extension,
      contentType: opts.contentType,
      maxExecutionTimeMs:
        opts.maxExecutionTimeMs ?? DEFAULT_MAX_EXECUTION_TIME_MS,
    },
    opts.context as TContext,
    opts.generate,
  ).catch((error) => {
    Logging.Error(`Export job ${jobId} failed:`, error);
  });

  return { jobId, extension: opts.extension, filename: opts.filename };
}

export async function loadExportJobForUser<TContext>(
  ctx: RequestContext,
  user: User,
  jobId: string,
  access?: ExportJobAccessOptions<TContext>,
): Promise<LoadedExportJob<TContext>> {
  assert(user, 401, "Authentication required");
  const tenantId = getRequestTenantId(ctx);
  const model = GetModel(ExportJobModel, tenantId);
  const record = await model.get(jobId);
  assert(record, 404, "Export not found");
  const context = assertOwnership(record, user, access);
  return { model, record, context };
}

/** Moment the stale export sweep drops the record and its stored file. */
export function getExportJobExpiry(record: ExportJob): Date {
  return new Date(new Date(record.updatedAt).getTime() + EXPORT_TTL_MS);
}

function toExportJobStatus(record: ExportJob): ExportJobStatus {
  return {
    status: record.status,
    progress: record.progress,
    error: record.error,
    filename: record.filename,
    extension: record.extension,
    result: readJobResult(record),
    expiresAt: getExportJobExpiry(record),
  };
}

export async function getExportJobStatus<TContext = unknown>(
  ctx: RequestContext,
  user: User,
  jobId: string,
  access?: ExportJobAccessOptions<TContext>,
): Promise<ExportJobStatus> {
  const { record } = await loadExportJobForUser(ctx, user, jobId, access);
  return toExportJobStatus(record);
}

/**
 * Lists the caller's own export jobs, most recent first — the history a scope
 * such as a tenant data export surfaces alongside its request action.
 */
export async function listExportJobs(
  ctx: RequestContext,
  user: User,
  options?: ListExportJobsOptions,
): Promise<ExportJobSummary[]> {
  assert(user, 401, "Authentication required");
  const tenantId = getRequestTenantId(ctx);
  const model = GetModel(ExportJobModel, tenantId);
  const records = await model.listForUser(
    user._id,
    options?.scope,
    options?.limit ?? DEFAULT_EXPORT_HISTORY_LIMIT,
  );
  return records.map((record) => ({
    ...toExportJobStatus(record),
    jobId: record._id,
    scope: record.scope,
    createdAt: record.createdAt,
  }));
}

/**
 * Streams a completed export job to the response, then returns without
 * awaiting the pipe. The api framework consumes the response stream only after
 * the handler resolves, so awaiting a backpressured pipe here would deadlock
 * any export larger than the stream highWaterMark. Storage/DB cleanup runs on
 * the stream's `close` event, covering both successful delivery and errors,
 * unless the job is retained until expiry.
 */
export async function downloadExportJob<TContext = unknown>(
  ctx: RequestContext,
  user: User,
  jobId: string,
  access?: ExportJobAccessOptions<TContext>,
): Promise<void> {
  const { model, record } = await loadExportJobForUser(
    ctx,
    user,
    jobId,
    access,
  );
  assert(record.status === ExportStatus.completed, 400, "Export not ready");
  assert(record.resultPath, 500, "Export result missing");

  const filename = buildExportFilename(record.filename, record.extension);
  const resourceKey = record.resultPath;
  const { body, size } = await streamExportFromStorage(resourceKey);

  if (size !== undefined) {
    ctx.response.addHeader("Content-Length", size.toString());
  }
  ctx.response.addHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  ctx.response.addHeader(
    "Access-Control-Expose-Headers",
    "Content-Disposition, Content-Length",
  );
  const writeStream = ctx.response.getWriteStream(record.contentType);

  const nodeReadable = Readable.fromWeb(
    // Node's web-stream types and the DOM BodyInit / AsyncIterable do not
    // overlap, so neither can be a single assertion; the runtime accepts
    // the stream.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
    body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );

  const cleanup = (): void => {
    void Promise.allSettled([
      deleteExportFromStorage(resourceKey),
      model.delete(jobId),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          Logging.Error(`Export job ${jobId} cleanup failed:`, result.reason);
        }
      }
    });
  };

  // A retained job stays downloadable until the sweep expires it: its history
  // row and any delivered link both outlive this first download.
  if (!record.retainUntilExpiry) {
    writeStream.once("close", cleanup);
  }
  nodeReadable.on("error", (err) => {
    Logging.Error(`Export stream error for job ${jobId}:`, err);
    writeStream.destroy(err);
  });
  nodeReadable.pipe(writeStream);
}
