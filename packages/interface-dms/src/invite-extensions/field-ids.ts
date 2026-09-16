/**
 * Separates an extension key from one of its field ids once the field is
 * merged into the invite form, whose ids share a single namespace with every
 * extension's. Two underscores rather than a dot: the browser form resolves a
 * dotted name as a nested path, which would nest the submitted value.
 *
 * An extension key may not contain the separator, so the first occurrence
 * always splits key from field id — even when the field id contains one too.
 */
export const INVITE_EXTENSION_FIELD_SEPARATOR = "__";

export interface InviteExtensionFieldId {
  key: string;
  fieldId: string;
}

export function inviteExtensionFieldId(key: string, fieldId: string): string {
  return `${key}${INVITE_EXTENSION_FIELD_SEPARATOR}${fieldId}`;
}

export function splitInviteExtensionFieldId(
  id: string,
): InviteExtensionFieldId | undefined {
  const index = id.indexOf(INVITE_EXTENSION_FIELD_SEPARATOR);
  if (index <= 0) return undefined;

  const fieldId = id.slice(index + INVITE_EXTENSION_FIELD_SEPARATOR.length);
  if (!fieldId) return undefined;

  return { key: id.slice(0, index), fieldId };
}
