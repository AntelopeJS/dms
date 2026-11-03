import type { JsonValue } from "./json";

/**
 * Payloads stored on an invitation, keyed by extension key: the JSON an admin
 * submitted for each extension's fields, kept as submitted until the
 * extension's own schema runs at delivery.
 */
export type InviteExtensionPayloads = Record<string, JsonValue>;
