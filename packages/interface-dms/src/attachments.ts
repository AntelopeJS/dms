import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import type {
  FileMetadata,
  UploadConstraints,
} from "@antelopejs/interface-file-storage";
import type { TableViewAttachmentSaveRequest } from "./internal/attachments";

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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Saved document fields are consumer-defined in this published attachment callback contract.
  document: Record<string, unknown>;
  result: T;
}

/** Context supplied by an authorized server-side write route, never by its client. */
export interface AttachmentSaveRequest {
  context: RequestContext;
  componentIds: string[];
  fields: AttachmentField[];
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Submitted component fields remain an open dictionary in the published save request.
  submitted: Record<string, unknown>;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The previous document has consumer-defined keys in the published request.
  before: Record<string, unknown>;
}

/** @internal */
export namespace internal {
  export const SaveTableViewAttachments = InterfaceFunction<
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- The runtime attachment implementation returns a consumer-specific save result through this published proxy.
    (request: TableViewAttachmentSaveRequest) => Promise<unknown>
  >();
}

type AttachmentSaver = <T>(
  request: AttachmentSaveRequest,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Promoted consumer fields use the same open dictionary as the published save request.
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
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- InterfaceFunction erases the callback/result generic correlation; the published proxy must retain AttachmentSaver's generic call signature.
  InterfaceFunction<AttachmentSaver>() as AttachmentSaver;

/**
 * Resolve prepared metadata for field validators; unknown references return undefined.
 *
 * @internal
 */
export const GetAttachmentValidationMetadata =
  InterfaceFunction<
    (key: string, storage?: string) => Promise<FileMetadata | undefined>
  >();
