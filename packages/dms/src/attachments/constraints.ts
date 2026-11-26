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

/** The refusal body of a constraint a file breaks: a translation key and its params. */
export type ConstraintViolation =
  | {
      message: "$dms.refusals.upload.file_too_large";
      params: { maxSize: number };
    }
  | {
      message: "$dms.refusals.upload.type_not_allowed";
      params: { mimetype: string; allowed: string };
    };

/** Describes the first constraint the file breaks, or `undefined` when it satisfies them all. */
export function findConstraintViolation(
  constraints: UploadConstraints | undefined,
  file: ConstrainedFile,
): ConstraintViolation | undefined {
  if (constraints?.maxSize !== undefined && file.size > constraints.maxSize)
    return {
      message: "$dms.refusals.upload.file_too_large",
      params: { maxSize: constraints.maxSize },
    };
  const allowed = constraints?.allowedMimetypes;
  if (
    allowed?.length &&
    !allowed.some((pattern) => matchesMimetype(file.mimetype, pattern))
  )
    return {
      message: "$dms.refusals.upload.type_not_allowed",
      params: { mimetype: file.mimetype, allowed: allowed.join(", ") },
    };
  return undefined;
}

/** Presign-time check; the declared size and type are re-verified against the stored object at promotion. */
export function assertUploadSatisfiesField(
  constraints: UploadConstraints | undefined,
  file: ConstrainedFile,
): void {
  const violation = findConstraintViolation(constraints, file);
  if (violation) throw new HTTPResult(UPLOAD_REJECTED_STATUS, violation);
}
