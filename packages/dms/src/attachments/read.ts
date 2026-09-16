import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import {
  CreateReadUrl,
  FileNotFoundError,
  GetFileMetadata,
} from "@antelopejs/interface-file-storage";
import type { UploadTokenClaims } from "../utils/upload-token";
import { assertNativeFileAccess } from "./access";
import {
  denyAttachment,
  loadAttachment,
  PRIVATE_LINK_TTL_SECONDS,
} from "./registry";

const SIGNING_MARGIN_SECONDS = 1;
const MILLISECONDS_PER_SECOND = 1000;

async function readStoredFile(key: string, storage?: string) {
  try {
    const metadata = await GetFileMetadata(key, storage);
    const read = await CreateReadUrl(
      key,
      PRIVATE_LINK_TTL_SECONDS - SIGNING_MARGIN_SECONDS,
      storage,
    );
    return { ...metadata, ...read };
  } catch (error) {
    if (error instanceof FileNotFoundError)
      throw new HTTPResult(404, "File not found");
    throw error;
  }
}

/** Native files use their originating page/component, never a document's GET. */
export async function readAttachment(
  context: RequestContext,
  key: string,
  storage?: string,
) {
  const attachment = await loadAttachment(key, storage);
  const claims = JSON.parse(attachment.claimsJson) as UploadTokenClaims;
  const principal = await assertNativeFileAccess(context, claims, false);
  if (attachment.tenantId !== principal.tenantId) denyAttachment();
  const deadline =
    Date.now() + PRIVATE_LINK_TTL_SECONDS * MILLISECONDS_PER_SECOND;
  const read = await readStoredFile(key, storage);
  if (
    claims.visibility !== "public" &&
    (!Number.isFinite(read.expiresAt) || (read.expiresAt as number) > deadline)
  ) {
    denyAttachment();
  }
  return read;
}
