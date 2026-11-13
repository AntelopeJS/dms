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
import type { UploadTokenClaims } from "../utils";
import { assertNativeFileAccess } from "./access";
import {
  isNull,
  isObject,
} from "@antelopejs/interface-dms/utils/internal/type-check";
import { findConstraintViolation } from "./constraints";
import {
  type AttachmentReference,
  collectAttachments,
  containsAttachment,
} from "./fields";
import { denyAttachment, findAttachment, loadAttachment } from "./registry";

const BAD_REQUEST = 400;

const FILE_NOT_FOUND_ERROR_NAME = "FileNotFoundError";

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
    if (error instanceof Error && error.name === FILE_NOT_FOUND_ERROR_NAME)
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
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- attachments.claimsJson is a stored column whose only writer is createAttachmentUpload (attachments/uploads.ts), JSON.stringify of an UploadTokenClaims, and stored rows are never parsed on read.
  const owner: UploadTokenClaims = JSON.parse(attachment.claimsJson);
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

/** A container of the submitted value: its keys and values, and the copy that receives them remapped. */
interface PendingCopy {
  keys: string[];
  values: unknown[];
  copy: object;
}

/**
 * Copies a submitted value with each string that names a promoted file
 * replaced by its canonical key. Walks with an explicit stack and allocates
 * no promise per node, so the memory it holds follows the size of the value
 * and never its depth. The value is walked as the only entry of a one-slot
 * array, so the root takes the same path as every child.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- remapValue copies one field of request.submitted, request JSON that may carry a value an earlier save stored, of any shape, with promoted keys swapped, after dms#728 bounds the body at 64 levels, walking it with the explicit stack of dms#739.
function remapValue(value: unknown, map: Map<string, string>): unknown {
  const result = [value];
  const pending: PendingCopy[] = [
    { keys: ["0"], values: [value], copy: result },
  ];
  for (let node = pending.pop(); node; node = pending.pop()) {
    for (const [index, key] of node.keys.entries()) {
      const item = node.values[index];
      let remapped = item;
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only strings can match promoted storage keys.
      if (typeof item === "string") remapped = map.get(item) ?? item;
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Primitive non-string values are preserved without traversal.
      else if (item && typeof item === "object") {
        const copy = Array.isArray(item) ? Array.from(item) : {};
        const source = Array.isArray(copy) ? copy : item;
        pending.push({
          keys: Object.keys(source),
          values: Object.values(source),
          copy,
        });
        remapped = copy;
      }
      Object.defineProperty(node.copy, key, {
        value: remapped,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return result[0];
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
    if (Object.hasOwn(document, field.key))
      document[field.key] = remapValue(document[field.key], mapping);
  }
  return document;
}

async function cleanRemoved(
  request: AttachmentSaveRequest,
  document: AttachmentSaveResult<unknown>["document"],
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

/** The deepest nesting of arrays and objects a submitted file field may have, the body itself counted. */
const MAX_BODY_DEPTH = 64;

/**
 * Refuses a submitted file field that nests arrays and objects deeper than
 * {@link MAX_BODY_DEPTH}, before the recursive walks over it can overflow the
 * stack. Walks with an explicit stack, so it is safe at any depth.
 *
 * @throws HTTPResult 400 when a field is nested too deep.
 */
function assertBodyDepth(request: AttachmentSaveRequest): void {
  const pending = request.fields.map((field) => ({
    value: request.submitted[field.key],
    depth: 2,
  }));
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (!isObject(node.value) || isNull(node.value)) continue;
    if (node.depth > MAX_BODY_DEPTH)
      throw new HTTPResult(
        BAD_REQUEST,
        `The JSON body nests more than ${MAX_BODY_DEPTH} levels deep.`,
      );
    for (const item of Object.values(node.value))
      pending.push({ value: item, depth: node.depth + 1 });
  }
}

/**
 * Failed saves retain promoted objects: another save may already reference
 * them. A submitted file field nested more than {@link MAX_BODY_DEPTH} levels
 * deep is refused with HTTP 400 before any file is touched.
 */
export async function SaveComponentFiles<T>(
  request: AttachmentSaveRequest,
  save: (
    promoted: AttachmentSaveRequest["submitted"],
  ) => Promise<AttachmentSaveResult<T>>,
): Promise<T> {
  assertBodyDepth(request);
  const refs = await prepareReferences(request);
  const saved = await save(await promoteReferences(request, refs));
  await cleanRemoved(request, saved.document);
  return saved.result;
}
