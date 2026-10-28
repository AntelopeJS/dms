import { RegisterNativeUploadField } from "../../attachments";
import type { UploadTokenClaims } from "../../utils";
import { signUploadToken } from "../../utils";

export const internal = { RegisterNativeUploadField };

/**
 * Implements {@link import("@antelopejs/interface-dms/uploads").SignUploadToken}.
 * Runs in the DMS backend, the only holder of the signing secret.
 */
export function SignUploadToken(claims: UploadTokenClaims): string {
  return signUploadToken(claims);
}
