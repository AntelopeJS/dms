// Client-side mirror of the backend upload-constraint check
// (`@antelopejs/interface-dms/base/data-types/default-types`). The backend stays
// the authority; validating here avoids uploading files the server will reject.

export interface FileFieldConstraints {
  maxSize?: number;
  allowedMimetypes?: string[];
}

export type FileConstraintViolation = "size" | "mimetype";

/**
 * Matches a file mimetype against an allowed pattern, supporting trailing
 * wildcards like `image/*`. Kept identical to the backend matcher so client
 * and server agree on what a field accepts.
 */
export function matchMimetype(actual: string, pattern: string): boolean {
  if (pattern === actual) return true;
  if (pattern.endsWith("/*")) return actual.startsWith(pattern.slice(0, -1));
  return false;
}

/**
 * Checks a file against a field's constraints. Returns the first violated
 * constraint (size before mimetype), or null when the file is acceptable or no
 * constraints are configured.
 */
export function checkFileConstraints(
  file: File,
  constraints?: FileFieldConstraints,
): FileConstraintViolation | null {
  if (!constraints) return null;

  if (constraints.maxSize && file.size > constraints.maxSize) {
    return "size";
  }

  const mimetypes = constraints.allowedMimetypes;
  if (mimetypes?.length) {
    const allowed = mimetypes.some((pattern) =>
      matchMimetype(file.type, pattern),
    );
    if (!allowed) return "mimetype";
  }

  return null;
}
