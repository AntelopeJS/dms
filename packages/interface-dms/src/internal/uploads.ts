import type { UploadConstraints } from "@antelopejs/interface-file-storage";

/** @internal */
export interface UploadTokenClaims {
  pageId?: string;
  componentId?: string;
  storage?: string;
  path?: string;
  field?: string;
  visibility?: "private" | "public";
  writePermission?: string;
}

/** @internal */
export type NativeUploadFieldRegistration = UploadTokenClaims & {
  pageId: string;
  componentId: string;
  readPermissions: string[];
  /** The field's own declared constraints, enforced at presign on top of the global ones. */
  constraints?: UploadConstraints;
};

/**
 * The keys of a native upload field's options that stamping and registration
 * read, and the token they write back. The options carry more keys than these,
 * and none of them is checked until it is read.
 *
 * @internal
 */
export interface UploadFieldOptions {
  storage?: unknown;
  path?: unknown;
  attachmentField?: unknown;
  visibility?: unknown;
  constraints?: unknown;
  uploadToken?: unknown;
}

/**
 * Read the component options of a file or image field before a token is
 * stamped into them. Absent options become an empty object that carries the
 * token.
 *
 * @throws TypeError when the options are neither absent nor an object, so the
 * field definition is refused where it is stamped or registered.
 * @internal
 */
export function readUploadFieldOptions(field: {
  type: string;
  component: { options?: unknown };
}): UploadFieldOptions {
  const options = field.component.options ?? {};
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Field options are erased contributor values; a primitive or an array cannot carry the upload token.
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(
      `A ${field.type} field's component options must be an object, got ${JSON.stringify(options)}`,
    );
  }
  field.component.options = options;
  return options;
}
