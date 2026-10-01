import { HTTPResult } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  DeleteFile,
  type FileMetadata,
  GetFileMetadata,
  isStagedKey,
  PromoteFile,
} from "@antelopejs/interface-file-storage";
import type {
  AttachmentSaveRequest,
  AttachmentSaveResult,
} from "@antelopejs/interface-dms/attachments";
import type { UploadTokenClaims } from "../utils/upload-token";
import { assertNativeFileAccess } from "./access";
import { findConstraintViolation } from "./constraints";
import {
  type AttachmentReference,
  collectAttachments,
  containsAttachment,
} from "./fields";
import { denyAttachment, findAttachment, loadAttachment } from "./registry";

const BAD_REQUEST = 400;
// Matched by name: the storage module throws its own copy of the class, which
// `instanceof` against the one imported here does not recognise.
const FILE_NOT_FOUND_ERROR_NAME = "FileNotFoundError";

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.name === FILE_NOT_FOUND_ERROR_NAME;
}

/**
 * The canonical key of a submitted reference and its stored metadata. A
 * reference whose bytes never reached storage (an upload that failed or never
 * ran) is the client's to fix, so it is refused as a bad request rather than
 * surfacing the storage error and its key.
 */
async function storedReference(ref: AttachmentReference) {
  try {
    const key = isStagedKey(ref.key)
      ? (await PromoteFile(ref.key, ref.field.storage)).resourceKey
      : ref.key;
    return { key, metadata: await GetFileMetadata(key, ref.field.storage) };
  } catch (error) {
    if (isFileNotFoundError(error))
      throw new HTTPResult(
        BAD_REQUEST,
        "A submitted file was never stored. Upload it again.",
      );
    throw error;
  }
}

function assertConstraints(
  metadata: FileMetadata,
  reference: AttachmentReference,
): void {
  if (findConstraintViolation(reference.field.constraints, metadata))
    denyAttachment();
}

async function validateReference(
  request: AttachmentSaveRequest,
  ref: AttachmentReference,
): Promise<void> {
  const attachment = await loadAttachment(ref.key, ref.field.storage);
  const owner = JSON.parse(attachment.claimsJson) as UploadTokenClaims;
  const principal = await assertNativeFileAccess(request.context, owner, false);
  if (
    principal.tenantId !== attachment.tenantId ||
    !owner.componentId ||
    !request.componentIds.includes(owner.componentId) ||
    owner.visibility !== (ref.field.visibility || "private")
  )
    denyAttachment();
}

async function prepareReferences(
  request: AttachmentSaveRequest,
): Promise<AttachmentReference[]> {
  const submitted = collectAttachments(request.fields, request.submitted);
  for (const ref of collectAttachments(request.fields, request.before))
    await validateReference(request, ref);
  for (const ref of submitted) await validateReference(request, ref);
  return submitted;
}

async function remapValue(
  value: unknown,
  map: Map<string, string>,
): Promise<unknown> {
  if (typeof value === "string") return map.get(value) ?? value;
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value))
    return Promise.all(value.map((item) => remapValue(item, map)));
  return Object.fromEntries(
    await Promise.all(
      Object.entries(value).map(async ([key, item]) => [
        key,
        await remapValue(item, map),
      ]),
    ),
  );
}

async function promoteReferences(
  request: AttachmentSaveRequest,
  refs: AttachmentReference[],
) {
  const document = { ...request.submitted };
  for (const field of request.fields) {
    const mapping = new Map<string, string>();
    for (const ref of refs.filter((ref) => ref.field.id === field.id)) {
      const { key, metadata } = await storedReference(ref);
      assertConstraints(metadata, ref);
      mapping.set(ref.key, key);
    }
    if (field.key in document)
      document[field.key] = await remapValue(document[field.key], mapping);
  }
  return document;
}

async function cleanRemoved(
  request: AttachmentSaveRequest,
  document: Record<string, unknown>,
) {
  const after = collectAttachments(request.fields, document);
  for (const ref of collectAttachments(request.fields, request.before)) {
    try {
      if (
        containsAttachment(after, ref) ||
        !(await findAttachment(ref.key, ref.field.storage))
      )
        continue;
      await DeleteFile(ref.key, ref.field.storage);
    } catch (error) {
      Logging.Error("Native file cleanup failed", error);
    }
  }
}

/** Failed saves retain promoted objects: another save may already reference them. */
export async function SaveComponentFiles<T>(
  request: AttachmentSaveRequest,
  save: (document: Record<string, unknown>) => Promise<AttachmentSaveResult<T>>,
): Promise<T> {
  const refs = await prepareReferences(request);
  const saved = await save(await promoteReferences(request, refs));
  await cleanRemoved(request, saved.document);
  return saved.result;
}
