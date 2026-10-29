import type {
  AttachmentField,
  AttachmentSaveRequest,
} from "@antelopejs/interface-dms/attachments";

export interface AttachmentReference {
  key: string;
  field: AttachmentField;
}

function extractKeys(
  value: AttachmentSaveRequest["submitted"][string],
  kind: AttachmentField["kind"],
): string[] {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A file reference is a nonempty string; other submitted values remain ignored.
  if (kind === "file" && typeof value === "string") return value ? [value] : [];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only containers can hold nested references.
  if (!value || typeof value !== "object") return [];
  if (!Array.isArray(value) && kind === "image" && "key" in value) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Image references require a nonempty string key.
    return typeof value.key === "string" && value.key ? [value.key] : [];
  }
  return Object.values(value).flatMap((item) => extractKeys(item, kind));
}

export function collectAttachments(
  fields: AttachmentField[],
  document: AttachmentSaveRequest["submitted"],
): AttachmentReference[] {
  return fields.flatMap((field) =>
    [...new Set(extractKeys(document[field.key], field.kind))].map((key) => ({
      key,
      field,
    })),
  );
}

export function containsAttachment(
  references: AttachmentReference[],
  reference: AttachmentReference,
): boolean {
  return references.some(
    (candidate) =>
      candidate.key === reference.key &&
      candidate.field.id === reference.field.id,
  );
}
