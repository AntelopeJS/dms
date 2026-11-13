/** @internal */
import type { UploadConstraints } from "@antelopejs/interface-file-storage";
import type { Component } from "../../component";
import type { UploadFieldOptions } from "../../internal/uploads";
import { isNumber, isObject, isString } from "../../utils/internal/type-check";

const NATIVE_UPLOAD_FIELD_TYPES = new Set(["file", "image"]);

/** @internal */
export interface UploadFieldNode {
  type: string;
  disabled?: unknown;
  component: { options?: unknown };
}

/** @internal */
export function isNativeUploadField(value: unknown): value is UploadFieldNode {
  if (!value || typeof value !== "object") return false;
  const node: { type?: unknown; component?: unknown } = value;
  if (
    typeof node.type !== "string" ||
    !NATIVE_UPLOAD_FIELD_TYPES.has(node.type)
  )
    return false;
  return !!node.component && typeof node.component === "object";
}

/** @internal */
export function readUploadConstraints(
  options: UploadFieldOptions,
): UploadConstraints | undefined {
  const raw = options.constraints;
  if (!raw || !isObject(raw)) return undefined;
  const declared: UploadConstraints = raw;
  const constraints: UploadConstraints = {};
  if (isNumber(declared.maxSize)) constraints.maxSize = declared.maxSize;
  if (Array.isArray(declared.allowedMimetypes))
    constraints.allowedMimetypes = declared.allowedMimetypes.filter(
      (mimetype) => isString(mimetype),
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
