import crypto from "node:crypto";
import { Logging } from "@antelopejs/interface-core/logging";
import { sign, verify } from "jsonwebtoken";
import { getAuthConfig } from "../config";

const UPLOAD_TOKEN_PURPOSE = "file-upload";
const FALLBACK_SECRET_BYTES = 32;

let fallbackUploadTokenSecret: string | undefined;

/**
 * Upload tokens are signed with `auth.jwtSecret`. Deployments without one
 * (e.g. the playground) fall back to a per-process random secret: tokens stay
 * tamper-proof, at the cost of invalidating open forms across a backend
 * restart. Signing with the empty string would instead throw — and, worse,
 * silently produce forgeable tokens if jsonwebtoken ever accepted it.
 */
function getUploadTokenSecret(): string {
  const configured = getAuthConfig().jwtSecret;
  if (configured) {
    return configured;
  }
  if (!fallbackUploadTokenSecret) {
    fallbackUploadTokenSecret = crypto
      .randomBytes(FALLBACK_SECRET_BYTES)
      .toString("hex");
    // Error, not Warn: behind more than one instance this silently rejects
    // most uploads — the token is signed by one process and verified by
    // another — and the only symptom is a 403 at presign with nothing tying it
    // back here. A deployment must see this in its error stream.
    Logging.Error(
      "auth.jwtSecret is not configured; upload tokens fall back to a per-process secret. Uploads will break across restarts and, on a multi-instance deployment, for every request that lands on another instance. Configure auth.jwtSecret.",
    );
  }
  return fallbackUploadTokenSecret;
}

/**
 * The authoritative upload destination of a File/Image field, resolved
 * server-side from the field's `options` (never from the client). Both parts
 * are optional: an absent `storage`/`path` means "use the storage layer's
 * default", which is still authoritative for that field.
 */
export interface UploadTokenClaims {
  pageId?: string;
  componentId?: string;
  storage?: string;
  path?: string;
  field?: string;
  visibility?: "private" | "public";
  writePermission?: string;
}

interface UploadTokenPayload extends UploadTokenClaims {
  purpose: string;
}

/**
 * Signs the authoritative `{storage, path}` of a File/Image field into a token
 * the client echoes back at presign time. This is what makes the upload
 * destination tamper-proof: the client cannot pick a different storage/path
 * than the one the field defines.
 *
 * No expiry is set on purpose. The token is a *destination binding*, not a
 * session credential — it only authorises uploading to the field's own storage
 * (exactly the capability the field already grants), and presign is still
 * gated by the tenant-member guard. A form left open for a long time must keep
 * working, so binding it to a short lifetime would only break legitimate late
 * uploads without adding meaningful protection.
 */
export function signUploadToken(claims: Partial<UploadTokenClaims>): string {
  const payload: UploadTokenPayload = { purpose: UPLOAD_TOKEN_PURPOSE };
  if (claims.pageId) payload.pageId = claims.pageId;
  if (claims.componentId) payload.componentId = claims.componentId;
  if (claims.storage !== undefined) payload.storage = claims.storage;
  if (claims.path !== undefined) payload.path = claims.path;
  if (claims.field !== undefined) payload.field = claims.field;
  if (claims.visibility !== undefined) payload.visibility = claims.visibility;
  if (claims.writePermission !== undefined)
    payload.writePermission = claims.writePermission;
  return sign(payload, getUploadTokenSecret());
}

/**
 * Verifies an upload token and returns its authoritative claims, or `null` when
 * the token is missing, tampered with, signed with a different secret, or was
 * not minted for uploads. Presign treats a `null` result as a rejection.
 */
export function verifyUploadToken(token: string): UploadTokenClaims | null {
  try {
    const payload = verify(token, getUploadTokenSecret(), {
      // The secret is an HMAC key, so nothing else could verify today — the
      // pin is what keeps an algorithm-confusion bug in the JWT library from
      // ever mattering here.
      algorithms: ["HS256"],
    }) as UploadTokenPayload;
    if (payload.purpose !== UPLOAD_TOKEN_PURPOSE) {
      return null;
    }
    const claims: UploadTokenClaims = {
      storage:
        typeof payload.storage === "string" ? payload.storage : undefined,
      path: typeof payload.path === "string" ? payload.path : undefined,
    };
    if (typeof payload.pageId === "string") claims.pageId = payload.pageId;
    if (typeof payload.componentId === "string")
      claims.componentId = payload.componentId;
    if (typeof payload.field === "string") claims.field = payload.field;
    if (payload.visibility !== undefined)
      claims.visibility =
        payload.visibility === "public" ? "public" : "private";
    if (typeof payload.writePermission === "string")
      claims.writePermission = payload.writePermission;
    return claims;
  } catch {
    return null;
  }
}
