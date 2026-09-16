import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";

export interface UploadTokenClaims {
  pageId?: string;
  componentId?: string;
  storage?: string;
  path?: string;
  field?: string;
  visibility?: "private" | "public";
  writePermission?: string;
}

export type NativeUploadFieldRegistration = UploadTokenClaims & {
  pageId: string;
  componentId: string;
  readPermissions: string[];
};

/** @internal */
export namespace internal {
  export const RegisterNativeUploadField = new RegisteringProxy<
    (registration: NativeUploadFieldRegistration) => void
  >();
}

/**
 * Sign a native field declaration. Page registration binds the exact mount;
 * unbound tokens cannot presign uploads. The token has no expiry because each
 * presign rechecks live membership, page/component access and write permission.
 * Only the DMS backend holds the signing secret.
 */
export const SignUploadToken =
  InterfaceFunction<(claims: UploadTokenClaims) => Promise<string>>();

const UPLOAD_FIELD_TYPES = new Set(["file", "image"]);

interface UploadFieldNode {
  type: string;
  component: { options?: Record<string, unknown> };
}

function isUploadFieldNode(node: unknown): node is UploadFieldNode {
  if (!node || typeof node !== "object") return false;
  const candidate = node as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    UPLOAD_FIELD_TYPES.has(candidate.type) &&
    !!candidate.component &&
    typeof candidate.component === "object"
  );
}

function hasUploadField(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(hasUploadField);
  }
  if (!node || typeof node !== "object") {
    return false;
  }
  if (isUploadFieldNode(node)) {
    return true;
  }
  return Object.values(node).some(hasUploadField);
}

async function stampNode(node: unknown): Promise<void> {
  if (Array.isArray(node)) {
    for (const item of node) await stampNode(item);
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  if (isUploadFieldNode(node)) {
    const component = node.component;
    if (!component.options || typeof component.options !== "object") {
      component.options = {};
    }
    const options = component.options;
    options.uploadToken = await SignUploadToken({
      pageId: "",
      componentId: "",
      storage:
        typeof options.storage === "string" ? options.storage : undefined,
      path: typeof options.path === "string" ? options.path : undefined,
      field:
        typeof options.attachmentField === "string"
          ? options.attachmentField
          : undefined,
      visibility: options.visibility === "public" ? "public" : "private",
    });
  }
  for (const value of Object.values(node)) await stampNode(value);
}

/**
 * Stamp a signed upload token into every File/Image field found in a
 * component's serialized options — the form's own fields, and the forms it
 * embeds (a relation field's inline add form, a table view's new/edit/view
 * forms), which serialize synchronously and therefore cannot stamp themselves.
 *
 * Components attach this through `transformOptions`. Page registration then
 * stamps the authoritative mounted declaration; tokens serialized outside a
 * registered page remain unbound and cannot authorize a native upload.
 *
 * Returns the input untouched when it holds no upload field; otherwise a deep
 * clone, since serialization can run again on a hot reload and each pass must
 * start from the untransformed declaration.
 */
export async function StampUploadFieldTokens<T>(options: T): Promise<T> {
  if (!hasUploadField(options)) {
    return options;
  }
  // Serialized form options can cross the interface boundary as context-bound proxies.
  const cloned = JSON.parse(JSON.stringify(options)) as T;
  await stampNode(cloned);
  return cloned;
}
