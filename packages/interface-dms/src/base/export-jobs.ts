/**
 * The export-job contract.
 *
 * Running an export is DMS behaviour -- it writes database rows, spools files
 * through temporary storage, zips and mails them -- so the module implements it
 * and this file only declares what a caller needs: the vocabulary, the
 * defaults, and the entry points. Everything the engine uses on the way
 * (storage upload, stale sweeps, filename building) stays inside the module.
 */
import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import type { User } from "../auth/db";
import type { ZodType, ZodTypeDef } from "zod";
import type { ExportJob } from "../db/tables/exportJobs.table";
import { MILLISECONDS_PER_DAY } from "../utils/internal/time";
import { readExportJobContext } from "./internal/export-jobs";
import type { ExportStatus } from "./types/export-status";

/** Lifetime of a stored export, enforced by the `sweep-stale-exports` cron. */
export const EXPORT_TTL_MS = MILLISECONDS_PER_DAY;

/** Query parameter carrying the job id on a delivered download link. */
export const EXPORT_JOB_QUERY_PARAM = "exportJob";
export const DEFAULT_EXPORT_FORMAT = "csv";
export const DEFAULT_DELIVERY = "download";
export const EMAIL_DELIVERY = "email";

export interface StreamedExport {
  body: ReadableStream<Uint8Array>;
  size: number | undefined;
}

export interface ExportWriter {
  writeHeaders(headers: string[]): void;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published export writers receive arbitrary application columns; each writer owns value serialization.
  appendRow(headers: string[], row: Record<string, unknown>): void;
  close(): void;
}

export interface Exporter {
  readonly extension: string;
  readonly contentType: string;
  createWriter(filePath: string): ExportWriter;
}

export interface ExportJobFailure {
  /** Part of the export that failed, e.g. a contributing module id. */
  source: string;
  error: string;
}

/** Result a `generate` implementation returns to report an incomplete export. */
export interface ExportJobResultSummary {
  partial: boolean;
  failures: ExportJobFailure[];
}

export interface ExportJobDeliveryOptions {
  delivery: string;
  /** Client-side path the delivered link points to. */
  deliveryPath?: string;
}

export interface Deliverer {
  /** Called when the job is created, so an unusable delivery fails fast. */
  validate?(options: ExportJobDeliveryOptions): void;
  deliver(exportRecord: ExportJob, resultPath: string): Promise<void>;
}

export interface ExportJobGenerateContext<TContext = unknown> {
  jobId: string;
  tenantId: string;
  localPath: string;
  /** The `context` passed to `runExportJob`: `undefined` when it passed none. */
  context: TContext | undefined;
  reportProgress: (progress: number) => Promise<void>;
  /** Aborted when the job exceeds `maxExecutionTimeMs`. */
  signal: AbortSignal;
}

export interface RunExportJobOptions<TContext = unknown> {
  ctx: RequestContext;
  user: User;
  scope: string;
  context?: TContext;
  filename: string;
  extension: string;
  contentType: string;
  delivery?: string;
  /** Client-side path a delivered link points to, required by email delivery. */
  deliveryPath?: string;
  /**
   * Keeps the record and its stored file after a download, until the stale
   * export sweep expires them. Required for scopes exposing a job history or a
   * delivered link, which both outlive the first download.
   */
  retainUntilExpiry?: boolean;
  /** Defaults to 10 minutes. Job is marked failed if `generate` exceeds this. */
  maxExecutionTimeMs?: number;
  /**
   * A returned summary is stored on the job and surfaced to its consumers.
   * `void` rather than `undefined`, which would reject the generators that
   * report no summary.
   */
  generate: (
    ctx: ExportJobGenerateContext<TContext>,
  ) => Promise<ExportJobResultSummary | void>;
}

/**
 * An access check of your own, run after the owner and scope checks: the
 * context the job was started with is read back through `contextSchema`, and
 * `isOwnedBy` decides on it.
 */
export interface ExportJobContextCheck<TContext> {
  /**
   * Reads back the `context` the job was started with, from the JSON it was
   * stored as: `null` for a job started without one, a `Date` as its ISO
   * string. A stored context the schema refuses refuses the job.
   */
  contextSchema: ZodType<TContext, ZodTypeDef, unknown>;
  /** Extra ACL beyond the userId check, on the context `contextSchema` read. */
  isOwnedBy: (record: ExportJob, context: TContext, user: User) => boolean;
}

/** An optional {@link ExportJobContextCheck}: both of its members, or neither. */
export type ExportJobOwnership<TContext = unknown> =
  | ExportJobContextCheck<TContext>
  | { contextSchema?: undefined; isOwnedBy?: undefined };

export type ExportJobAccessOptions<TContext = unknown> =
  ExportJobOwnership<TContext> & { scope?: string };

export interface ExportJobTicket {
  jobId: string;
  extension: string;
  filename: string;
}

export interface ExportJobStatus {
  status: ExportStatus;
  progress: number;
  error?: string;
  filename?: string;
  extension?: string;
  /** Present once completed: reports whether parts of the export are missing. */
  result?: ExportJobResultSummary;
  /** When the stale export sweep drops the job and its stored file. */
  expiresAt?: Date;
}

export interface ExportJobSummary extends ExportJobStatus {
  jobId: string;
  scope: string;
  createdAt: Date;
}

export interface ListExportJobsOptions {
  scope?: string;
  limit?: number;
}

/** Looks up an export format by id; the DMS ships `csv`. */
export const getExporter = InterfaceFunction<(format: string) => Exporter>();

/** Looks up a delivery mode by id; the DMS ships `download` and `email`. */
export const getDeliverer =
  InterfaceFunction<(delivery: string) => Deliverer>();

/**
 * A proxy carries no type parameter of its own, so the generic entry points
 * below erase the caller's context type on the way in. The engine never reads
 * `context`: it carries it back to `generate` untouched, which is why the
 * erased shape widens the value and narrows the callback -- that way every
 * `TContext` fits it without an assertion.
 */
interface ErasedRunExportJobOptions extends Omit<
  RunExportJobOptions,
  "context" | "generate"
> {
  context?: unknown;
  generate: (
    ctx: ExportJobGenerateContext<never>,
  ) => Promise<ExportJobResultSummary | void>;
}

/**
 * The access options a proxy takes: the caller's
 * {@link ExportJobContextCheck} folded into one check that reads the job's
 * context itself, so no context type crosses the proxy.
 */
interface ErasedExportJobAccessOptions {
  scope?: string;
  isOwnedBy?: (record: ExportJob, user: User) => boolean;
}

function eraseAccess<TContext>(
  access: ExportJobAccessOptions<TContext> | undefined,
): ErasedExportJobAccessOptions | undefined {
  if (!access?.isOwnedBy) return access;
  const { contextSchema, isOwnedBy } = access;
  return {
    scope: access.scope,
    isOwnedBy: (record, user) => {
      const context = readExportJobContext(record, contextSchema);
      return context.success && isOwnedBy(record, context.data, user);
    },
  };
}

/**
 * The proxies behind the generic entry points below. `ImplementInterface`
 * binds a proxy only by walking this subpath's exports, so a module-private
 * proxy is never bound and every call to it waits forever. Not in an
 * `internal` namespace: the `base` barrel already re-exports table-view's.
 *
 * @internal
 */
export const runExportJobProxy =
  InterfaceFunction<(options: ErasedRunExportJobOptions) => ExportJobTicket>();

/** @internal */
export const getExportJobStatusProxy =
  InterfaceFunction<
    (
      ctx: RequestContext,
      user: User,
      jobId: string,
      access?: ErasedExportJobAccessOptions,
    ) => ExportJobStatus
  >();

/** @internal */
export const downloadExportJobProxy =
  InterfaceFunction<
    (
      ctx: RequestContext,
      user: User,
      jobId: string,
      access?: ErasedExportJobAccessOptions,
    ) => void
  >();

/** Starts an export job and returns the ticket its caller polls. */
export function runExportJob<TContext = unknown>(
  options: RunExportJobOptions<TContext>,
): Promise<ExportJobTicket> {
  return runExportJobProxy(options);
}

export function getExportJobStatus<TContext = unknown>(
  ctx: RequestContext,
  user: User,
  jobId: string,
  access?: ExportJobAccessOptions<TContext>,
): Promise<ExportJobStatus> {
  return getExportJobStatusProxy(ctx, user, jobId, eraseAccess(access));
}

/**
 * Streams a completed export job to the response. Returns once the pipe is
 * started, not once it has drained.
 */
export function downloadExportJob<TContext = unknown>(
  ctx: RequestContext,
  user: User,
  jobId: string,
  access?: ExportJobAccessOptions<TContext>,
): Promise<void> {
  return downloadExportJobProxy(ctx, user, jobId, eraseAccess(access));
}

/** Lists the caller's own export jobs, most recent first. */
export const listExportJobs =
  InterfaceFunction<
    (
      ctx: RequestContext,
      user: User,
      options?: ListExportJobsOptions,
    ) => ExportJobSummary[]
  >();
