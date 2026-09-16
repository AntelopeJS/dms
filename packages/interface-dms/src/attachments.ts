import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import type {
  FileMetadata,
  UploadConstraints,
} from "@antelopejs/interface-file-storage";

/** A server-declared file field; ids must match the form's attachmentField. */
export interface AttachmentField {
  id: string;
  key: string;
  kind: "file" | "image";
  storage?: string;
  visibility?: "private" | "public";
  constraints?: UploadConstraints;
}

/** The actual saved values used to clean removed native files. */
export interface AttachmentSaveResult<T> {
  document: Record<string, unknown>;
  result: T;
}

/** Context supplied by an authorized server-side write route, never by its client. */
export interface AttachmentSaveRequest {
  context: RequestContext;
  componentIds: string[];
  fields: AttachmentField[];
  submitted: Record<string, unknown>;
  before: Record<string, unknown>;
}

/** Trusted inputs used to wrap a table-view attachment write. */
export interface TableViewAttachmentSaveRequest {
  controller: unknown;
  route: DataControllerCallback;
  context: RequestContext;
  params: unknown;
  args: unknown[];
  mode: "save" | "delete";
  componentIds: string[];
}

/** @internal */
export namespace internal {
  export const SaveTableViewAttachments =
    InterfaceFunction<
      (request: TableViewAttachmentSaveRequest) => Promise<unknown>
    >();
}

type AttachmentSaver = <T>(
  request: AttachmentSaveRequest,
  save: (promoted: Record<string, unknown>) => Promise<AttachmentSaveResult<T>>,
) => Promise<T>;

/**
 * Validate native-file provenance, promote staging keys, then save once.
 * Call after write authorization with the trusted component identity and fields.
 * Staged retries require trusted provider promotion replay; canonical metadata
 * is validated before save. Failed saves never move or delete promoted objects:
 * another save may reference them. Retained objects keep their declared visibility.
 * Removed files are deleted after successful persistence; cleanup errors are logged.
 * This is not reference-counted cleanup: callers own the risk of shared keys.
 */
export const SaveComponentFiles =
  InterfaceFunction<AttachmentSaver>() as AttachmentSaver;

/** Resolve prepared metadata for field validators; unknown references return undefined. */
export const GetAttachmentValidationMetadata =
  InterfaceFunction<
    (key: string, storage?: string) => Promise<FileMetadata | undefined>
  >();
