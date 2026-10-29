/** Payloads stored on an invitation, keyed by extension key. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This public storage contract preserves each extension's unparsed input until its own schema runs at delivery.
export type InviteExtensionPayloads = Record<string, unknown>;
