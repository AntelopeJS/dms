/** @internal */
import type { UploadConstraints } from "@antelopejs/interface-file-storage";
import type { Component } from "../../component";
import type { SlotOptions } from "../../component-slots";

const NATIVE_UPLOAD_FIELD_TYPES = new Set(["file", "image"]);

/** @internal */
export interface UploadFieldNode {
  type: string;
  disabled?: boolean;
  component: { options?: SlotOptions };
}

/** @internal */
export function isNativeUploadField(
  value: SlotOptions[string],
): value is UploadFieldNode {
  if (!value || typeof value !== "object") return false;
  const node: Partial<Pick<SlotOptions, keyof UploadFieldNode>> = value;
  return (
    typeof node.type === "string" &&
    NATIVE_UPLOAD_FIELD_TYPES.has(node.type) &&
    !!node.component &&
    typeof node.component === "object"
  );
}

/** @internal */
export function readUploadConstraints(
  options: SlotOptions,
): UploadConstraints | undefined {
  const raw = options.constraints;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This is the serialized upload-constraints boundary; absent or nonobject constraints are ignored.
  if (!raw || typeof raw !== "object") return undefined;
  const declared: UploadConstraints = raw;
  const constraints: UploadConstraints = {};
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only numeric maxSize values from erased upload options are copied into the file-storage contract.
  if (typeof declared.maxSize === "number")
    constraints.maxSize = declared.maxSize;
  if (Array.isArray(declared.allowedMimetypes))
    constraints.allowedMimetypes = declared.allowedMimetypes.filter(
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Serialized mimetype lists may contain arbitrary values; keep the existing string-only constraint projection.
      (mimetype) => typeof mimetype === "string",
    );
  return constraints;
}

/** @internal */
export function resolveWritePermission(
  componentName: string,
  component: Component,
  path: readonly string[],
): string | undefined {
  if (componentName !== "dms-table-view")
    return component.getAction("submit")?.permissionId;
  const match = Object.entries({ new: "add", edit: "edit" }).find(([mode]) =>
    path.includes(mode),
  );
  return (
    (match && component.getAction(match[1])?.permissionId) ??
    "__native_upload_disabled__"
  );
}
