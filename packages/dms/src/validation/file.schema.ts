import { z } from "zod";

const MAX_FILENAME_LENGTH = 255;
const MAX_MIMETYPE_LENGTH = 255;
const MAX_STORAGE_NAME_LENGTH = 64;
const MAX_RESOURCE_KEY_LENGTH = 1024;
const MAX_UPLOAD_TOKEN_LENGTH = 4096;

const CONTROL_CHAR_MAX = 0x1f;
const DELETE_CHAR = 0x7f;

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= CONTROL_CHAR_MAX || code === DELETE_CHAR) return true;
  }
  return false;
}

/**
 * Applies the shared path-safety rules to a string schema: reject traversal
 * sequences, absolute paths, backslashes and control characters. Used for both
 * the client-supplied upload `path` prefix and the metadata `resourceKey`, so
 * neither can escape the intended (staging) prefix or point at an absolute
 * location on a filesystem-backed storage adapter.
 */
function withPathSafety(schema: z.ZodString) {
  return schema
    .refine((value) => !value.includes(".."), "must not contain '..'")
    .refine((value) => !value.startsWith("/"), "must be relative")
    .refine((value) => !value.includes("\\"), "must not contain backslashes")
    .refine(
      (value) => !hasControlChars(value),
      "must not contain control characters",
    );
}

/**
 * The original filename. It is stored as metadata and may be used by a storage
 * adapter when deriving a key, so reject path separators and control characters
 * (double dots in a real name stay allowed — only separators enable traversal).
 */
const filenameSchema = z
  .string()
  .min(1)
  .max(MAX_FILENAME_LENGTH)
  .refine(
    (value) => !value.includes("/") && !value.includes("\\"),
    "filename must not contain path separators",
  )
  .refine(
    (value) => !hasControlChars(value),
    "filename must not contain control characters",
  );

const resourceKeySchema = withPathSafety(
  z.string().min(1).max(MAX_RESOURCE_KEY_LENGTH),
);

/**
 * A storage backend name. The file-storage interface exposes no runtime
 * enumeration of the configured storages, so this validates the shape only
 * (bounded length, restricted charset) rather than against a live allowlist.
 */
const storageNameSchema = z
  .string()
  .min(1)
  .max(MAX_STORAGE_NAME_LENGTH)
  .regex(/^[a-zA-Z0-9._-]+$/, "storage name has an invalid format");

/**
 * The signed upload token minted per File/Image field when a page layout is
 * served. It carries the field's authoritative storage/path, so the presign
 * route no longer accepts a client-supplied `storage`/`path` — the client
 * cannot choose where an upload lands. Only its shape (a bounded, non-empty
 * string) is validated here; the signature is verified in the route.
 */
const uploadTokenSchema = z.string().min(1).max(MAX_UPLOAD_TOKEN_LENGTH);

export const presignBodySchema = z.object({
  filename: filenameSchema,
  size: z.number().int().nonnegative(),
  // Browsers report an empty type for files with an unknown extension; keep
  // accepting it (only bound the length) so those uploads are not rejected.
  mimetype: z.string().max(MAX_MIMETYPE_LENGTH),
  uploadToken: uploadTokenSchema,
});

/**
 * Query parameters for the metadata endpoint. `resourceKey` is a server-issued
 * key (it may carry the staging prefix and slashes) and gets full path safety
 * scrutiny.
 */
export const metadataQuerySchema = z.object({
  resourceKey: resourceKeySchema,
  storage: storageNameSchema.optional(),
});
