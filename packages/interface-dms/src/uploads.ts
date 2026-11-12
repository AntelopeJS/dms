import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import {
  type NativeUploadFieldRegistration,
  readUploadFieldOptions,
  type UploadTokenClaims,
} from "./internal/uploads";
import { isString } from "./utils/internal/type-check";

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
  component: { options?: unknown };
}

function isTraversable(value: unknown): value is object {
  return !!value && typeof value === "object";
}

function isUploadFieldNode(node: unknown): node is UploadFieldNode {
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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Walks every value of the serialized options a component declares, its own T, at any depth that declaration has, to find the upload fields among them.
function uploadFieldNodes(node: unknown): UploadFieldNode[] {
  if (!isTraversable(node)) return [];
  return [
    ...(isUploadFieldNode(node) ? [node] : []),
    ...Object.values(node).flatMap(uploadFieldNodes),
  ];
}

async function stampNode(node: UploadFieldNode): Promise<void> {
  const options = readUploadFieldOptions(node);
  options.uploadToken = await SignUploadToken({
    pageId: "",
    componentId: "",
    storage: isString(options.storage) ? options.storage : undefined,
    path: isString(options.path) ? options.path : undefined,
    field: isString(options.attachmentField)
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
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- The JSON round trip clones the caller's options as any and types the clone as its T, kept by the 2026-11-02 16:00 ruling because any other clone changes the upload answer.
  const cloned: T = JSON.parse(JSON.stringify(options));
  for (const node of uploadFieldNodes(cloned)) await stampNode(node);
  return cloned;
}
