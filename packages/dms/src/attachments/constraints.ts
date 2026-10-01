import { HTTPResult } from "@antelopejs/interface-api";
import type {
  FileMetadata,
  UploadConstraints,
} from "@antelopejs/interface-file-storage";

const UPLOAD_REJECTED_STATUS = 400;
const WILDCARD_SUFFIX = "/*";

export type ConstrainedFile = Pick<FileMetadata, "size" | "mimetype">;

function matchesMimetype(mimetype: string, pattern: string): boolean {
  if (pattern === mimetype) return true;
  return (
    pattern.endsWith(WILDCARD_SUFFIX) &&
    mimetype.startsWith(pattern.slice(0, -1))
  );
}

/** Describes the first constraint the file breaks, or `undefined` when it satisfies them all. */
export function findConstraintViolation(
  constraints: UploadConstraints | undefined,
  file: ConstrainedFile,
): string | undefined {
  if (constraints?.maxSize !== undefined && file.size > constraints.maxSize)
    return `the file exceeds this field's maximum size of ${constraints.maxSize} bytes`;
  const allowed = constraints?.allowedMimetypes;
  if (
    allowed?.length &&
    !allowed.some((pattern) => matchesMimetype(file.mimetype, pattern))
  )
    return `type "${file.mimetype}" is not allowed for this field (allowed: ${allowed.join(", ")})`;
  return undefined;
}

/** Presign-time check; the declared size and type are re-verified against the stored object at promotion. */
export function assertUploadSatisfiesField(
  constraints: UploadConstraints | undefined,
  file: ConstrainedFile,
): void {
  const violation = findConstraintViolation(constraints, file);
  if (violation)
    throw new HTTPResult(
      UPLOAD_REJECTED_STATUS,
      `Upload rejected: ${violation}.`,
    );
}
