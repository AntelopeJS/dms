import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import type {
  NativeUploadFieldRegistration,
  UploadTokenClaims,
} from "./internal/uploads";

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
 *
 * @internal
 */
export const SignUploadToken =
  InterfaceFunction<(claims: UploadTokenClaims) => Promise<string>>();

const UPLOAD_FIELD_TYPES = new Set(["file", "image"]);

interface UploadFieldNode {
  type: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Serialized component options carry consumer-defined fields alongside upload settings.
  component: { options?: Record<string, unknown> };
}

function isUploadFieldNode(
  node: Parameters<typeof StampUploadFieldTokens>[0],
): node is UploadFieldNode {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Traversal accepts arbitrary serialized option values and only inspects object nodes.
  if (!node || typeof node !== "object") return false;
  const candidate: Partial<
    Record<keyof UploadFieldNode, Parameters<typeof StampUploadFieldTokens>[0]>
  > = node;
  return (
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A native upload node must name a file or image field rather than an arbitrary option type.
    typeof candidate.type === "string" &&
    UPLOAD_FIELD_TYPES.has(candidate.type) &&
    !!candidate.component &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the serialized-node shape check before accessing the component's options.
    typeof candidate.component === "object"
  );
}

function hasUploadField(
  node: Parameters<typeof StampUploadFieldTokens>[0],
): boolean {
  if (Array.isArray(node)) {
    return node.some(hasUploadField);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Recursive traversal stops at primitive leaves of consumer options.
  if (!node || typeof node !== "object") {
    return false;
  }
  if (isUploadFieldNode(node)) {
    return true;
  }
  return Object.values(node).some(hasUploadField);
}

async function stampNode(
  node: Parameters<typeof StampUploadFieldTokens>[0],
): Promise<void> {
  if (Array.isArray(node)) {
    for (const item of node) await stampNode(item);
    return;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Primitive option leaves have no upload fields or child objects to stamp.
  if (!node || typeof node !== "object") {
    return;
  }
  if (isUploadFieldNode(node)) {
    const component = node.component;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The existing serialized-node check does not validate options; non-object options are replaced before stamping.
    if (!component.options || typeof component.options !== "object") {
      component.options = {};
    }
    const options = component.options;
    options.uploadToken = await SignUploadToken({
      pageId: "",
      componentId: "",
      storage:
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Serialized consumer storage values contribute to claims only when strings.
        typeof options.storage === "string" ? options.storage : undefined,
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only a string serialized path is copied into upload claims.
      path: typeof options.path === "string" ? options.path : undefined,
      field:
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only a string attachmentField identifies the server-declared upload field.
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
  const cloned: T = JSON.parse(JSON.stringify(options));
  await stampNode(cloned);
  return cloned;
}
