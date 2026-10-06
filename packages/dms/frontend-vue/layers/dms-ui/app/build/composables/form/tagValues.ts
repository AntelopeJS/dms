/** What the tags of a tags field are (interface-dms `TagItemType`). */
export type TagItemType = "string" | "email";

export interface AddTagsOptions {
  itemType?: TagItemType;
  max?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Addresses compare in lower case: "Ann@acme.io" is the one "ann@acme.io".
const NORMALIZERS: Record<TagItemType, (item: string) => string> = {
  string: (item) => item.trim(),
  email: (item) => item.trim().toLowerCase(),
};

/**
 * The items of a tags field once more are added: each trimmed (an address
 * in lower case), a repeated one ignored, none past `max`.
 */
export function addTags(
  current: readonly string[],
  incoming: readonly string[],
  options: AddTagsOptions = {},
): string[] {
  const normalize = NORMALIZERS[options.itemType ?? "string"];
  const next: string[] = [];
  for (const item of [...current, ...incoming].map(normalize)) {
    if (!item || next.includes(item)) continue;
    if (options.max !== undefined && next.length >= options.max) break;
    next.push(item);
  }
  return next;
}

/** The items a field of this type refuses: an address that is none. */
export function invalidTags(
  items: readonly string[],
  itemType: TagItemType | undefined,
): string[] {
  if (itemType !== "email") return [];
  return items.filter((item) => !EMAIL_PATTERN.test(item));
}
