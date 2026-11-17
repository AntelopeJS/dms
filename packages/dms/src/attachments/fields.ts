import type {
  AttachmentField,
  AttachmentSaveResult,
} from "@antelopejs/interface-dms/attachments";
import { ownValue } from "../utils/own-value";
import { isString } from "@antelopejs/interface-dms/utils/internal/type-check";

export interface AttachmentReference {
  key: string;
  field: AttachmentField;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function collectAttachments(
  fields: AttachmentField[],
  document: AttachmentSaveResult<unknown>["document"],
): AttachmentReference[] {
  return fields.flatMap((field) => {
    const keys = new Set<string>();
    const pending: unknown[] = [ownValue(document, field.key)];
    while (pending.length > 0) {
      const item = pending.pop();
      if (field.kind === "file" && isString(item)) {
        if (item) keys.add(item);
      } else if (isRecord(item)) {
        if (!Array.isArray(item) && field.kind === "image" && "key" in item) {
          if (isString(item.key) && item.key) keys.add(item.key);
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
