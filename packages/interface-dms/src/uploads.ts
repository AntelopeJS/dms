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

interface UploadFieldNode {
  type: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Serialized component options carry consumer-defined fields alongside upload settings.
  component: { options?: Record<string, unknown> };
}

function isTraversable(
  value: Parameters<typeof StampUploadFieldTokens>[0],
): value is object {
  return !!value && typeof value === "object";
}

function isUploadFieldNode(
  node: Parameters<typeof StampUploadFieldTokens>[0],
): node is UploadFieldNode {
  return (
    isTraversable(node) &&
    !Array.isArray(node) &&
    "type" in node &&
    (node.type === "file" || node.type === "image") &&
    "component" in node &&
    isTraversable(node.component)
  );
}

/** Every upload field of a serialized value, an enclosing one before the ones it holds. */
function uploadFieldNodes(
  node: Parameters<typeof StampUploadFieldTokens>[0],
): UploadFieldNode[] {
  if (!isTraversable(node)) return [];
  return [
    ...(isUploadFieldNode(node) ? [node] : []),
    ...Object.values(node).flatMap(uploadFieldNodes),
  ];
}

async function stampNode(node: UploadFieldNode): Promise<void> {
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
  if (uploadFieldNodes(options).length === 0) {
    return options;
  }
  const cloned: T = JSON.parse(JSON.stringify(options));
  for (const node of uploadFieldNodes(cloned)) await stampNode(node);
  return cloned;
}
