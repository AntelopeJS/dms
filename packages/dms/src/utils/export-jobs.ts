import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { Send } from "@antelopejs/interface-email";
import {
  CreateReadUrl,
  CreateUploadUrl,
  DeleteFile,
  FileExists,
} from "@antelopejs/interface-file-storage";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { ExportStatus } from "@antelopejs/interface-dms/base/types";
import {
  GenerateHtml,
  RegisterHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";
import { stringify } from "csv-stringify/sync";
import { getClientBaseUrl } from "../config";
import { ExportJobModel } from "@antelopejs/interface-dms/db/models/exportJobs.model";
import type { ExportJob } from "@antelopejs/interface-dms/db/tables/exportJobs.table";
import { runInBatches } from "./run-in-batches";
import {
  type Deliverer,
  type ExportJobDeliveryOptions,
  type ExportJobResultSummary,
  type Exporter,
  type ExportWriter,
  EXPORT_JOB_QUERY_PARAM,
  EXPORT_TTL_MS,
  type StreamedExport,
} from "@antelopejs/interface-dms/base/export-jobs";
import { MILLISECONDS_PER_HOUR } from "@antelopejs/interface-dms/utils/time";

// The contract declares the vocabulary and the defaults; re-exported here so a
// caller inside the module reaches the whole export surface from one place.
export type {
  Deliverer,
  ExportJobDeliveryOptions,
  ExportJobFailure,
  ExportJobResultSummary,
  Exporter,
  ExportWriter,
  StreamedExport,
} from "@antelopejs/interface-dms/base/export-jobs";
export {
  DEFAULT_DELIVERY,
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_HISTORY_LIMIT,
  EMAIL_DELIVERY,
  EXPORT_JOB_QUERY_PARAM,
  EXPORT_TTL_MS,
} from "@antelopejs/interface-dms/base/export-jobs";
const EXPORT_TMP_PREFIX = "dms-export-";
const EXPORT_STORAGE_PREFIX = "table-view-exports";
const READ_URL_EXPIRES_IN_SEC = 60 * 60;

const ARRAY_JOIN_SEPARATOR = ";";
const FILENAME_ILLEGAL_CHARS = /[^a-zA-Z0-9._-]/g;
const FILENAME_REPLACEMENT = "-";

function castCsvValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(ARRAY_JOIN_SEPARATOR);
  return String(value);
}

class CsvWriter implements ExportWriter {
  constructor(private readonly filePath: string) {}

  writeHeaders(headers: string[]): void {
    fs.writeFileSync(this.filePath, `﻿${headers.join(",")}\n`);
  }

  appendRow(headers: string[], row: Record<string, unknown>): void {
    const csvRowContent = stringify([row], {
      header: false,
      columns: headers,
      cast: {
        date: (value: Date) => value.toISOString(),
        string: castCsvValue,
      },
    });
    fs.appendFileSync(this.filePath, csvRowContent);
  }

  close(): void {}
}

const csvExporter: Exporter = {
  extension: "csv",
  contentType: "text/csv; charset=utf-8",
  createWriter(filePath: string): ExportWriter {
    return new CsvWriter(filePath);
  },
};

const exporters: Record<string, Exporter> = {
  csv: csvExporter,
};

export function getExporter(format: string): Exporter {
  const exporter = exporters[format];
  assert(exporter, 400, `Unknown export format: ${format}`);
  return exporter;
}

const downloadDeliverer: Deliverer = {
  async deliver(): Promise<void> {},
};

interface ExportReadyEmailData {
  userName: string;
  downloadLink: string;
  expiresIn: string;
  partial: boolean;
  failedSources: string[];
}

const ExportReadyTemplate =
  RegisterHtmlTemplate<ExportReadyEmailData>("EmailExportReady");

const EXPORT_READY_SUBJECT = "Your data export is ready";

function buildDeliveryLink(exportRecord: ExportJob): string {
  const baseUrl = getClientBaseUrl();
  assert(baseUrl, 500, "clientBaseUrl is required to deliver an export link");
  return `${baseUrl}${exportRecord.deliveryPath}?${EXPORT_JOB_QUERY_PARAM}=${exportRecord._id}`;
}

export function readJobResult(
  exportRecord: ExportJob,
): ExportJobResultSummary | undefined {
  if (!exportRecord.json_result) return undefined;
  return JSON.parse(exportRecord.json_result) as ExportJobResultSummary;
}

const emailDeliverer: Deliverer = {
  validate(options: ExportJobDeliveryOptions): void {
    assert(
      options.deliveryPath,
      400,
      "Email delivery requires a deliveryPath to build the download link",
    );
  },
  async deliver(exportRecord: ExportJob): Promise<void> {
    const user = await GetModel(UserModel).get(exportRecord.userId);
    assert(user, 500, "Export recipient not found");
    const result = readJobResult(exportRecord);
    const html = await GenerateHtml(ExportReadyTemplate, {
      userName: user.name || user.email,
      downloadLink: buildDeliveryLink(exportRecord),
      expiresIn: `${EXPORT_TTL_MS / MILLISECONDS_PER_HOUR} hours`,
      partial: result?.partial ?? false,
      failedSources: (result?.failures ?? []).map((failure) => failure.source),
    });

    const sent = await Send({
      to: user.email,
      subject: EXPORT_READY_SUBJECT,
      html,
    });
    assert(
      sent.success,
      500,
      `Failed to send export email: ${sent.error?.message}`,
    );
  },
};

const deliverers: Record<string, Deliverer> = {
  download: downloadDeliverer,
  email: emailDeliverer,
};

export function getDeliverer(delivery: string): Deliverer {
  const deliverer = deliverers[delivery];
  assert(deliverer, 400, `Unknown export delivery: ${delivery}`);
  return deliverer;
}

export function getExportLocalScratchPath(
  exportId: string,
  extension: string,
): string {
  return path.join(os.tmpdir(), `${EXPORT_TMP_PREFIX}${exportId}.${extension}`);
}

export async function uploadExportToStorage(
  localPath: string,
  tenantId: string,
  exportId: string,
  extension: string,
  contentType: string,
): Promise<string> {
  const { size } = await fs.promises.stat(localPath);
  const filename = `${exportId}.${extension}`;
  const presign = await CreateUploadUrl({
    filename,
    size,
    mimetype: contentType,
    path: `${EXPORT_STORAGE_PREFIX}/${tenantId}`,
  });

  const fileStream = fs.createReadStream(localPath);
  const response = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: presign.headers,
    // Node's web-stream types and the DOM BodyInit / AsyncIterable do not
    // overlap, so neither can be a single assertion; the runtime accepts
    // the stream.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
    body: Readable.toWeb(fileStream) as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  // A rejected upload must fail the job: the artifact does not exist, and a
  // completed job would hand the requester a download — or an e-mail link —
  // that resolves to nothing. The body is discarded first, or the connection
  // stays held until the response is garbage-collected.
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    assert(false, 500, `Failed to upload export: HTTP ${response.status}`);
  }

  await fs.promises.unlink(localPath).catch(() => undefined);
  return presign.resourceKey;
}

export async function streamExportFromStorage(
  resourceKey: string,
): Promise<StreamedExport> {
  const presign = await CreateReadUrl(resourceKey, READ_URL_EXPIRES_IN_SEC);
  const response = await fetch(presign.url);
  assert(response.ok, 500, `Failed to fetch export: HTTP ${response.status}`);
  assert(response.body, 500, "Export response has no body");
  const contentLengthHeader = response.headers.get("content-length");
  const size = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  return { body: response.body, size };
}

export async function deleteExportFromStorage(
  resourceKey: string,
): Promise<void> {
  try {
    await DeleteFile(resourceKey);
  } catch (error) {
    if (await FileExists(resourceKey)) throw error;
  }
}

const UPDATED_AT_INDEX = "updatedAt";
const EPOCH_LOWER_BOUND = new Date(0);
const EXPORT_DELETE_BATCH_SIZE = 10;
const EXPORT_SWEEP_PAGE_SIZE = 100;
const TENANT_SWEEP_BATCH_SIZE = 5;

async function removeExportRecord(
  model: ExportJobModel,
  record: ExportJob,
): Promise<void> {
  if (record.resultPath) {
    await deleteExportFromStorage(record.resultPath);
  }
  await model.delete(record._id);
}

async function removeStaleRecords(
  model: ExportJobModel,
  threshold: Date,
): Promise<void> {
  while (true) {
    const staleRecords = await model.table
      .between(UPDATED_AT_INDEX, EPOCH_LOWER_BOUND, threshold)
      .filter((record) =>
        record
          .key("status")
          .eq(ExportStatus.completed)
          .or(record.key("status").eq(ExportStatus.failed)),
      )
      .slice(0, EXPORT_SWEEP_PAGE_SIZE)
      .run();
    await runInBatches(staleRecords, EXPORT_DELETE_BATCH_SIZE, (record) =>
      removeExportRecord(model, record),
    );
    if (staleRecords.length < EXPORT_SWEEP_PAGE_SIZE) return;
  }
}

async function sweepStaleExportsForTenant(
  tenantId: string,
  ttlMs: number,
): Promise<void> {
  const threshold = new Date(Date.now() - ttlMs);
  const model = GetModel(ExportJobModel, tenantId);
  await removeStaleRecords(model, threshold);
}

export async function sweepStaleExportsAllTenants(
  ttlMs: number,
): Promise<void> {
  const tenantModel = GetModel(TenantModel);
  const tenants = await tenantModel.getAll();
  await runInBatches(tenants, TENANT_SWEEP_BATCH_SIZE, (tenant) =>
    sweepStaleExportsForTenant(tenant._id, ttlMs),
  );
}

export async function deleteAllExportsForTenant(
  tenantId: string,
): Promise<void> {
  const model = GetModel(ExportJobModel, tenantId);
  let offset = 0;
  while (true) {
    const records = await model.table
      .slice(offset, offset + EXPORT_SWEEP_PAGE_SIZE)
      .run();
    await runInBatches(records, EXPORT_DELETE_BATCH_SIZE, async (record) => {
      if (record.resultPath) await deleteExportFromStorage(record.resultPath);
    });
    if (records.length < EXPORT_SWEEP_PAGE_SIZE) break;
    offset += EXPORT_SWEEP_PAGE_SIZE;
  }
  await model.table.delete().run();
}

function sanitizeFilenameSegment(segment: string): string {
  return segment.replace(FILENAME_ILLEGAL_CHARS, FILENAME_REPLACEMENT);
}

export function buildExportFilename(base: string, extension: string): string {
  const timestamp = sanitizeFilenameSegment(new Date().toISOString());
  const safeBase = sanitizeFilenameSegment(base);
  return `${safeBase}-${timestamp}.${extension}`;
}
