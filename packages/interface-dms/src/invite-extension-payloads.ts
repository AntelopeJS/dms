import type { JsonPrimitive } from "./json";

/**
 * A JSON value an invitation stores for an extension. It is only read back, so
 * read-only arrays and objects are accepted where it is passed in.
 */
export type InviteExtensionJson =
  | JsonPrimitive
  | readonly InviteExtensionJson[]
  | { readonly [key: string]: InviteExtensionJson };

/**
 * Payloads stored on an invitation, keyed by extension key: the JSON an admin
 * submitted for each extension's fields, kept as submitted until the
 * extension's own schema runs at delivery.
 */
export type InviteExtensionPayloads = Record<string, InviteExtensionJson>;
