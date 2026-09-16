import fs from "node:fs";
import type { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  GetRegisteredHooks,
  Hook,
  type RegisteredHook,
  type TenantDataExportContribution,
  type TenantExportArchive,
  type TenantExportManifest,
  type TenantExportModuleReport,
} from "@antelopejs/interface-dms/hooks";
import archiver from "archiver";
import type {
  ExportJobResultSummary,
  ExportJobTicket,
} from "@antelopejs/interface-dms/base/export-jobs";
import type {
  BuildTenantExportArchiveOptions,
  StartTenantExportJobOptions,
} from "@antelopejs/interface-dms/base/tenant-export-archive";
import {
  TENANT_EXPORT_CONTENT_TYPE,
  TENANT_EXPORT_EXTENSION,
} from "@antelopejs/interface-dms/base/tenant-export-archive";
import { runExportJob } from "./export-jobs-run";

export type {
  BuildTenantExportArchiveOptions,
  StartTenantExportJobOptions,
} from "@antelopejs/interface-dms/base/tenant-export-archive";
export {
  TENANT_EXPORT_CONTENT_TYPE,
  TENANT_EXPORT_EXTENSION,
} from "@antelopejs/interface-dms/base/tenant-export-archive";

const MANIFEST_ENTRY = "manifest.json";
const MODULES_DIRECTORY = "modules";
const JSON_INDENT = 2;
const JSON_EXTENSION = "json";
const MODULE_ID_ILLEGAL_CHARS = /[^a-zA-Z0-9._-]/g;
const MODULE_ID_REPLACEMENT = "-";
const UNNAMED_MODULE_ID = "module";
const PATH_SEPARATORS = /[\\/]+/;
const TRAVERSAL_SEGMENTS: readonly string[] = [".", ".."];
const FULL_PROGRESS = 100;
const DEDUPE_START_SUFFIX = 2;

type TenantExportContributor = RegisteredHook<Hook.TENANT_DATA_EXPORT>;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Tenant export aborted");
}

class ExportArchiveWriter {
  private readonly archive = archiver("zip");
  private readonly output: fs.WriteStream;
  private failure: unknown;

  constructor(
    localPath: string,
    private readonly signal: AbortSignal,
  ) {
    this.output = fs.createWriteStream(localPath);
    // The consumer must be attached before the first entry: archiver's zip
    // stream has a bounded internal buffer and stalls forever once it fills
    // with nobody reading.
    this.archive.pipe(this.output);
    // A permanent listener keeps a late archive error from reaching Node as an
    // unhandled 'error' event; it is replayed on the next write instead.
    this.archive.on("error", (error: unknown) => {
      this.failure ??= error;
    });
    this.archive.on("warning", (warning: unknown) => {
      Logging.Warn("[dms] tenant export archive warning:", warning);
    });
    this.output.on("error", (error: unknown) => {
      this.failure ??= error;
    });
    this.signal.addEventListener("abort", () => this.archive.abort(), {
      once: true,
    });
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw abortReason(this.signal);
    }
  }

  /**
   * A broken zip stream cannot be recovered from, so it fails the export rather
   * than yielding an archive that claims to be merely partial.
   */
  assertUsable(): void {
    if (this.failure) {
      throw this.failure;
    }
  }

  appendJson(name: string, data: unknown): Promise<void> {
    const payload = Buffer.from(JSON.stringify(data, null, JSON_INDENT));
    return this.append(name, () => {
      this.archive.append(payload, { name });
    });
  }

  appendStream(name: string, stream: Readable): Promise<void> {
    return this.append(name, () => {
      this.archive.append(stream, { name });
    });
  }

  async appendFile(name: string, localPath: string): Promise<void> {
    // An unreadable path only surfaces as an archiver warning, which would
    // leave the awaited entry pending forever.
    await fs.promises.stat(localPath);
    await this.append(name, () => {
      this.archive.file(localPath, { name });
    });
  }

  async finalize(): Promise<void> {
    const closed = finished(this.output);
    // A failing finalize destroys the output before `closed` is awaited, which
    // would otherwise surface as an unhandled rejection.
    closed.catch(() => undefined);
    await this.archive.finalize();
    await closed;
  }

  destroy(): void {
    this.archive.abort();
    this.output.destroy();
  }

  /**
   * Resolves only once the archiver has consumed the entry, so a producer
   * awaiting it inherits the archive's back-pressure instead of buffering.
   */
  private async append(name: string, enqueue: () => void): Promise<void> {
    this.throwIfAborted();
    this.assertUsable();
    const consumed = this.waitForEntry(name);
    enqueue();
    await consumed;
  }

  private waitForEntry(name: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const settle = (outcome: () => void): void => {
        this.archive.off("entry", onEntry);
        this.archive.off("error", onError);
        this.signal.removeEventListener("abort", onAbort);
        outcome();
      };
      const onEntry = (entry: archiver.EntryData): void => {
        if (entry.name === name) settle(resolve);
      };
      const onError = (error: unknown): void => settle(() => reject(error));
      const onAbort = (): void =>
        settle(() => reject(abortReason(this.signal)));

      this.archive.on("entry", onEntry);
      this.archive.on("error", onError);
      this.signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

class ScopedTenantExportArchive implements TenantExportArchive {
  readonly entries: string[] = [];
  private closed = false;

  constructor(
    private readonly writer: ExportArchiveWriter,
    private readonly moduleId: string,
  ) {}

  close(): void {
    this.closed = true;
  }

  addJson(path: string, data: unknown): Promise<void> {
    return this.add(path, (name) => this.writer.appendJson(name, data));
  }

  addFile(path: string, localPath: string): Promise<void> {
    return this.add(path, (name) => this.writer.appendFile(name, localPath));
  }

  addStream(path: string, stream: Readable): Promise<void> {
    return this.add(path, (name) => this.writer.appendStream(name, stream));
  }

  private async add(
    path: string,
    append: (name: string) => Promise<void>,
  ): Promise<void> {
    if (this.closed) {
      throw new Error(
        `Tenant export archive for '${this.moduleId}' is no longer writable`,
      );
    }
    const name = this.resolveEntryName(path);
    await append(name);
    this.entries.push(name);
  }

  private resolveEntryName(path: string): string {
    const segments = path
      .split(PATH_SEPARATORS)
      .filter(
        (segment) => segment !== "" && !TRAVERSAL_SEGMENTS.includes(segment),
      );
    if (segments.length === 0) {
      throw new Error(`Invalid tenant export archive path: '${path}'`);
    }
    return [MODULES_DIRECTORY, this.moduleId, ...segments].join("/");
  }
}

function sanitizeModuleId(moduleId: string): string {
  return moduleId.replace(MODULE_ID_ILLEGAL_CHARS, MODULE_ID_REPLACEMENT);
}

function resolveModuleIds(contributors: TenantExportContributor[]): string[] {
  const taken = new Set<string>();
  return contributors.map((contributor, index) => {
    const base = sanitizeModuleId(
      contributor.moduleId ?? `${UNNAMED_MODULE_ID}-${index}`,
    );
    let candidate = base;
    let suffix = DEDUPE_START_SUFFIX;
    while (taken.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix++;
    }
    taken.add(candidate);
    return candidate;
  });
}

async function writeContribution(
  writer: ExportArchiveWriter,
  moduleId: string,
  // Mirrors the hook result, which stays `void` so a contributor may return
  // nothing.
  contribution: TenantDataExportContribution | void,
): Promise<string | undefined> {
  if (!contribution) return undefined;
  await writer.appendJson(
    `${MODULES_DIRECTORY}/${moduleId}.${JSON_EXTENSION}`,
    contribution.data,
  );
  return contribution.moduleId === moduleId ? undefined : contribution.moduleId;
}

async function collectContribution(
  scoped: ScopedTenantExportArchive,
  contributor: TenantExportContributor,
  options: BuildTenantExportArchiveOptions,
) {
  try {
    return await contributor.handler(options.tenantId, scoped, options.signal);
  } finally {
    // Writes are refused past the handler's return: a late one would land in
    // the stream position of whichever contributor runs next.
    scoped.close();
  }
}

async function runContributor(
  writer: ExportArchiveWriter,
  moduleId: string,
  contributor: TenantExportContributor,
  options: BuildTenantExportArchiveOptions,
): Promise<TenantExportModuleReport> {
  const scoped = new ScopedTenantExportArchive(writer, moduleId);
  try {
    const contribution = await collectContribution(
      scoped,
      contributor,
      options,
    );
    const declaredModuleId = await writeContribution(
      writer,
      moduleId,
      contribution,
    );
    return {
      moduleId,
      declaredModuleId,
      entries: scoped.entries,
      failed: false,
    };
  } catch (error) {
    // An abort or a broken archive cancels the whole export; only a genuine
    // contributor failure degrades it to a partial archive.
    writer.throwIfAborted();
    writer.assertUsable();
    Logging.Error(
      `[dms] tenant data export contributor '${moduleId}' failed:`,
      error,
    );
    return {
      moduleId,
      entries: scoped.entries,
      failed: true,
      error: describeError(error),
    };
  }
}

async function runContributors(
  writer: ExportArchiveWriter,
  options: BuildTenantExportArchiveOptions,
): Promise<TenantExportModuleReport[]> {
  const contributors = GetRegisteredHooks(Hook.TENANT_DATA_EXPORT);
  const moduleIds = resolveModuleIds(contributors);
  const reports: TenantExportModuleReport[] = [];
  for (const [index, contributor] of contributors.entries()) {
    writer.throwIfAborted();
    reports.push(
      await runContributor(writer, moduleIds[index], contributor, options),
    );
    await options.reportProgress?.(
      ((index + 1) / contributors.length) * FULL_PROGRESS,
    );
  }
  return reports;
}

function buildManifest(
  tenantId: string,
  reports: TenantExportModuleReport[],
): TenantExportManifest {
  return {
    tenantId,
    exportedAt: new Date().toISOString(),
    partial: reports.some((report) => report.failed),
    modules: reports,
  };
}

function summarize(
  reports: TenantExportModuleReport[],
): ExportJobResultSummary {
  const failures = reports
    .filter((report) => report.failed)
    .map((report) => ({
      source: report.moduleId,
      error: report.error ?? "",
    }));
  return { partial: failures.length > 0, failures };
}

/**
 * Assembles a tenant's data export as a ZIP holding `manifest.json`, one
 * `modules/<moduleId>.json` per JSON contribution and the heavy entries each
 * contributor streamed in. Contributors run serially so the archive applies
 * back-pressure to a single producer at a time; a failing one is recorded in
 * the manifest and yields a partial archive rather than failing the export.
 */
export async function buildTenantExportArchive(
  options: BuildTenantExportArchiveOptions,
): Promise<ExportJobResultSummary> {
  const writer = new ExportArchiveWriter(options.localPath, options.signal);
  try {
    const reports = await runContributors(writer, options);
    await writer.appendJson(
      MANIFEST_ENTRY,
      buildManifest(options.tenantId, reports),
    );
    await writer.finalize();
    return summarize(reports);
  } catch (error) {
    writer.destroy();
    throw error;
  }
}

/**
 * Runs {@link buildTenantExportArchive} as a background export job. The job is
 * retained until expiry: its archive is reachable from a delivered link and
 * from the job history long after the first download.
 */
export function startTenantExportJob(
  options: StartTenantExportJobOptions,
): Promise<ExportJobTicket> {
  return runExportJob({
    ...options,
    extension: TENANT_EXPORT_EXTENSION,
    contentType: TENANT_EXPORT_CONTENT_TYPE,
    retainUntilExpiry: true,
    generate: ({ tenantId, localPath, signal, reportProgress }) =>
      buildTenantExportArchive({
        tenantId,
        localPath,
        signal,
        reportProgress,
      }),
  });
}
