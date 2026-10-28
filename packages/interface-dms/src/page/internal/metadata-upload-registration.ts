/** @internal */
import type { ComponentInfoSerialized } from "../../component";
import type { NativeUploadFieldRegistration } from "../../internal/uploads";
import { internal as uploadInternal } from "../../uploads";
import type { PageMetadata } from "../metadata";
import { metadataOwner } from "./metadata-owner";
import {
  readUploadConstraints,
  resolveWritePermission,
  type UploadFieldNode,
} from "./metadata-uploads";

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
  const options = node.component.options ?? {};
  node.component.options = options;
  const registration: NativeUploadFieldRegistration = {
    pageId: page.pageInfo?.fullId ?? "",
    componentId,
    storage:
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Native upload discovery projects only string storage names from erased contributor options.
      typeof options.storage === "string" ? options.storage : undefined,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Native upload discovery projects only string paths from erased contributor options.
    path: typeof options.path === "string" ? options.path : undefined,
    field:
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The serialized attachment field overrides the discovered path only when it is a string.
      typeof options.attachmentField === "string"
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
