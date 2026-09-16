/**
 * The tenant data export contract.
 *
 * Assembling the archive is DMS behaviour -- it walks the registered
 * contributors, streams their entries into a ZIP and hands the result to the
 * export engine -- so the module implements it and this file declares the
 * entry points a caller needs.
 */
import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import type { User } from "../auth/db";
import type { ExportJobResultSummary, ExportJobTicket } from "./export-jobs";

export const TENANT_EXPORT_EXTENSION = "zip";
export const TENANT_EXPORT_CONTENT_TYPE = "application/zip";

export interface BuildTenantExportArchiveOptions {
  tenantId: string;
  /** Scratch file the ZIP is written to, typically the export job's local path. */
  localPath: string;
  signal: AbortSignal;
  reportProgress?: (progress: number) => Promise<void>;
}

export interface StartTenantExportJobOptions {
  ctx: RequestContext;
  user: User;
  scope: string;
  filename: string;
  delivery?: string;
  /** Client-side path a delivered link points to, required by email delivery. */
  deliveryPath?: string;
  maxExecutionTimeMs?: number;
}

/**
 * Assembles a tenant's data export as a ZIP holding `manifest.json`, one
 * `modules/<moduleId>.json` per JSON contribution and the heavy entries each
 * contributor streamed in. A failing contributor is recorded in the manifest
 * and yields a partial archive rather than failing the export.
 */
export const buildTenantExportArchive =
  InterfaceFunction<
    (options: BuildTenantExportArchiveOptions) => ExportJobResultSummary
  >();

/**
 * Runs {@link buildTenantExportArchive} as a background export job. The job is
 * retained until expiry: its archive is reachable from a delivered link and
 * from the job history long after the first download.
 */
export const startTenantExportJob =
  InterfaceFunction<
    (options: StartTenantExportJobOptions) => ExportJobTicket
  >();
