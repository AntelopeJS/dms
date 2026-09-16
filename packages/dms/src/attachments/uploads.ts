import type { RequestContext } from "@antelopejs/interface-api";
import {
  CreateUploadUrl,
  GetFileMetadata,
  type UploadRequest,
} from "@antelopejs/interface-file-storage";
import { getUploadsConfig } from "../config";
import { buildUploadConstraints } from "../utils/upload-constraints";
import type { UploadTokenClaims } from "../utils/upload-token";
import { assertNativeFileAccess } from "./access";
import { attachmentId, attachmentTable, findAttachment } from "./registry";

/** Persist immutable native-file provenance; staging promotion keeps its identity. */
export async function createAttachmentUpload(
  context: RequestContext,
  request: UploadRequest,
  claims: UploadTokenClaims,
) {
  const principal = await assertNativeFileAccess(context, claims, true);
  const upload = await CreateUploadUrl(
    { ...request, staging: true, visibility: claims.visibility || "private" },
    buildUploadConstraints(getUploadsConfig()),
    claims.storage,
  );
  await attachmentTable()
    .insert({
      _id: attachmentId(upload.resourceKey, claims.storage),
      tenantId: principal.tenantId,
      storage: claims.storage || "",
      resourceKey: upload.resourceKey,
      claimsJson: JSON.stringify(claims),
    })
    .run();
  return upload;
}

/** Resolves nothing for a key that belongs to no prepared attachment. */
export async function GetAttachmentValidationMetadata(
  key: string,
  storage?: string,
) {
  if (!(await findAttachment(key, storage))) return undefined;
  return GetFileMetadata(key, storage);
}
