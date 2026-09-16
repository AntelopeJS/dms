import type { Readable } from "node:stream";

/**
 * Sink handed to `Hook.TENANT_DATA_EXPORT` contributors.
 *
 * Entry paths are namespaced with `modules/<moduleId>/` by the implementation,
 * so a contributor never has to guard against another module's paths. Every
 * method resolves only once the archiver has consumed the entry: awaiting them
 * is what propagates the archiver's back-pressure to the producer and keeps
 * memory flat whatever the exported volume.
 */
export interface TenantExportArchive {
  /** Serializes `data` as a JSON entry. */
  addJson(path: string, data: unknown): Promise<void>;
  /** Adds an artifact already materialized on disk. */
  addFile(path: string, localPath: string): Promise<void>;
  /** Adds a remote or generated dump without ever holding it in memory. */
  addStream(path: string, stream: Readable): Promise<void>;
}

/**
 * JSON payload of a contributor, written to `modules/<moduleId>.json`.
 * Returning nothing is valid for contributors that only write archive entries.
 */
export interface TenantDataExportContribution {
  moduleId: string;
  data: unknown;
}

/** Per-contributor outcome, as recorded in the archive manifest. */
export interface TenantExportModuleReport {
  moduleId: string;
  /** Present when the returned contribution used another id than the archive one. */
  declaredModuleId?: string;
  entries: string[];
  failed: boolean;
  error?: string;
}

export interface TenantExportManifest {
  tenantId: string;
  exportedAt: string;
  /** True when at least one contributor failed and its data is missing. */
  partial: boolean;
  modules: TenantExportModuleReport[];
}
