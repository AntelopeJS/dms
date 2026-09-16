import { createHash } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { stripStagingPrefix } from "@antelopejs/interface-file-storage";
import { AttachmentModel } from "../db/models/attachments.model";

export const PRIVATE_LINK_TTL_SECONDS = 60;
const FORBIDDEN = 403;

export function attachmentTable() {
  return GetModel(AttachmentModel).table;
}

export function denyAttachment(): never {
  throw new HTTPResult(FORBIDDEN, "File access denied.");
}

export function attachmentId(key: string, storage?: string): string {
  return createHash("sha256")
    .update(JSON.stringify([storage || "", stripStagingPrefix(key)]))
    .digest("hex");
}

export async function findAttachment(key: string, storage?: string) {
  return GetModel(AttachmentModel).get(attachmentId(key, storage));
}

export async function loadAttachment(key: string, storage?: string) {
  const attachment = await findAttachment(key, storage);
  if (!attachment) denyAttachment();
  return attachment;
}
