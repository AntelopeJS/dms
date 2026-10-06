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
