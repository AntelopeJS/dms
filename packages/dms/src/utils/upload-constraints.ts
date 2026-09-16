import type { UploadConstraints } from "@antelopejs/interface-file-storage";
import type { UploadsConfig } from "../config";

const UPLOAD_VALIDATION_ERROR_NAME = "UploadValidationError";

/**
 * Turns the global uploads config into the {@link UploadConstraints} passed to
 * `CreateUploadUrl` at presign time. A `maxSize` of `0` (or less) means "no
 * size cap" — the opt-out for deployments that legitimately upload very large
 * files — and an empty `allowedMimetypes` means "no mimetype restriction".
 */
export function buildUploadConstraints(
  config: UploadsConfig,
): UploadConstraints {
  const constraints: UploadConstraints = {};
  if (config.maxSize > 0) {
    constraints.maxSize = config.maxSize;
  }
  if (config.allowedMimetypes.length > 0) {
    constraints.allowedMimetypes = config.allowedMimetypes;
  }
  return constraints;
}

/**
 * Structural check for the storage layer's `UploadValidationError`. `instanceof`
 * is unreliable here because the error is thrown from a different physical copy
 * of `@antelopejs/interface-file-storage` than the one this module imports, so
 * match on the class `name` instead.
 */
export function isUploadValidationError(error: unknown): boolean {
  return error instanceof Error && error.name === UPLOAD_VALIDATION_ERROR_NAME;
}
