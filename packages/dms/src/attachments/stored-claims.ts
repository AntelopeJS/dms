import { z } from "zod";
import type { UploadTokenClaims } from "../utils";
import { denyAttachment } from "./registry";

const UploadTokenClaimsSchema: z.ZodType<UploadTokenClaims> = z.object({
  pageId: z.string().optional(),
  componentId: z.string().optional(),
  storage: z.string().optional(),
  path: z.string().optional(),
  field: z.string().optional(),
  visibility: z.enum(["private", "public"]).optional(),
  writePermission: z.string().optional(),
});

/**
 * The upload claims an attachment row stores in `claimsJson`, as
 * `createAttachmentUpload` wrote them. A row holding anything else grants no
 * access: it is refused like a file whose claims match no live declaration.
 *
 * @throws HTTPResult 403 when the stored claims are not upload claims
 */
export function readStoredClaims(claimsJson: string): UploadTokenClaims {
  const parsed = UploadTokenClaimsSchema.safeParse(JSON.parse(claimsJson));
  if (!parsed.success) denyAttachment();
  return parsed.data;
}
