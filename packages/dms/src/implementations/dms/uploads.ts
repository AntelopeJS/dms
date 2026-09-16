import { RegisterNativeUploadField } from "../../attachments/access";
import type { UploadTokenClaims } from "../../utils/upload-token";
import { signUploadToken } from "../../utils/upload-token";

export const internal = { RegisterNativeUploadField };

/**
 * Implements {@link import("@antelopejs/interface-dms/uploads").SignUploadToken}.
 * Runs in the DMS backend, the only holder of the signing secret.
 */
export function SignUploadToken(claims: UploadTokenClaims): string {
  return signUploadToken(claims);
}
