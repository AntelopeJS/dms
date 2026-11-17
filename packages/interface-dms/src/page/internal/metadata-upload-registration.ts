/** @internal */
import type { ComponentInfoSerialized } from "../../component";
import {
  type NativeUploadFieldRegistration,
  readUploadFieldOptions,
} from "../../internal/uploads";
import { internal as uploadInternal, SignUploadToken } from "../../uploads";
import type { PageMetadata } from "../metadata";
import { metadataOwner } from "./metadata-owner";
import {
  readUploadConstraints,
  resolveWritePermission,
  type UploadFieldNode,
} from "./metadata-uploads";
import { isString } from "../../utils/internal/type-check";

/** @internal */
export function prepareUploadOptions(
  page: PageMetadata,
  serialized: ComponentInfoSerialized,
  componentId: string,
): boolean {
  const owner = metadataOwner(page);
  if (owner.detached || owner.componentMap.get(componentId)?.access !== "own")
    return false;
  if (serialized.options)
    serialized.options = JSON.parse(JSON.stringify(serialized.options));
  return true;
}

/** @internal */
export function prepareUploadRegistration(
  page: PageMetadata,
  node: UploadFieldNode,
  componentName: string,
  componentId: string,
  path: string[],
) {
  const owner = metadataOwner(page);
  const mount = owner.componentMap.get(componentId);
  if (owner.detached || mount?.access !== "own") return;
  const options = readUploadFieldOptions(node);
  const registration: NativeUploadFieldRegistration = {
    pageId: page.pageInfo?.fullId ?? "",
    componentId,
    storage: isString(options.storage) ? options.storage : undefined,
    path: isString(options.path) ? options.path : undefined,
    field: isString(options.attachmentField)
      ? options.attachmentField
      : path.join("/"),
    visibility: options.visibility === "public" ? "public" : "private",
    writePermission: node.disabled
      ? "__native_upload_disabled__"
      : resolveWritePermission(componentName, mount.component, path),
    readPermissions:
      owner.registersPermissions() && !page.pageInfo?.publicAccess
        ? componentId
            .slice(owner.pagePermissionId.length + 1)
            .split(".")
            .map(
              (_, index, parts) =>
                `${owner.pagePermissionId}.${parts.slice(0, index + 1).join(".")}`,
            )
        : [],
    constraints: readUploadConstraints(options),
  };
  return { mount, options, registration, componentId };
}

/** @internal */
export function finishUploadRegistration(
  page: PageMetadata,
  phase: NonNullable<ReturnType<typeof prepareUploadRegistration>>,
): void {
  const owner = metadataOwner(page);
  if (
    owner.detached ||
    owner.componentMap.get(phase.componentId) !== phase.mount
  )
    return;
  uploadInternal.RegisterNativeUploadField.register(phase.registration);
  const fields = owner.nativeUploadFields.get(phase.componentId) ?? [];
  fields.push(phase.registration);
  owner.nativeUploadFields.set(phase.componentId, fields);
}

/** @internal */
export async function registerNativeUploadField(
  page: PageMetadata,
  node: UploadFieldNode,
  componentName: string,
  componentId: string,
  path: string[],
): Promise<void> {
  const phase = prepareUploadRegistration(
    page,
    node,
    componentName,
    componentId,
    path,
  );
  if (!phase) return;
  phase.options.uploadToken = await SignUploadToken(phase.registration);
  finishUploadRegistration(page, phase);
}
