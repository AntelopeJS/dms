import type { AttachmentField } from "@antelopejs/interface-dms/attachments";
import { ownValue } from "../utils/own-value";

export interface AttachmentReference {
  key: string;
  field: AttachmentField;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function collectAttachments(
  fields: AttachmentField[],
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The published AttachmentSaveRequest.submitted and before and AttachmentSaveResult.document hold whichever table's request body or stored fields, read here by its file column keys.
  document: Record<string, unknown>,
): AttachmentReference[] {
  return fields.flatMap((field) => {
    const keys = new Set<string>();
    const pending: unknown[] = [ownValue(document, field.key)];
    while (pending.length > 0) {
      const item = pending.pop();
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A file reference is a nonempty string; other submitted values remain ignored.
      if (field.kind === "file" && typeof item === "string") {
        if (item) keys.add(item);
      } else if (isRecord(item)) {
        if (!Array.isArray(item) && field.kind === "image" && "key" in item) {
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Image references require a nonempty string key.
          if (typeof item.key === "string" && item.key) keys.add(item.key);
        } else {
          const children = Object.values(item);
          for (let index = children.length - 1; index >= 0; index -= 1)
            pending.push(children[index]);
        }
      }
    }
    return [...keys].map((key) => ({ key, field }));
  });
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
