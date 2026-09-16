import type { AttachmentField } from "@antelopejs/interface-dms/attachments";

export interface AttachmentReference {
  key: string;
  field: AttachmentField;
}

function extractKeys(value: unknown, kind: AttachmentField["kind"]): string[] {
  if (kind === "file" && typeof value === "string") return value ? [value] : [];
  if (!value || typeof value !== "object") return [];
  if (!Array.isArray(value) && kind === "image" && "key" in value) {
    return typeof value.key === "string" && value.key ? [value.key] : [];
  }
  return Object.values(value).flatMap((item) => extractKeys(item, kind));
}

export function collectAttachments(
  fields: AttachmentField[],
  document: Record<string, unknown>,
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
