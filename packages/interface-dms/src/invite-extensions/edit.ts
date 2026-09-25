import { isDeepStrictEqual } from "node:util";
import { inviteExtensionFieldId } from "./field-ids";
import { assertSliceValid, readPayload, sliceOf } from "./payload-slices";
import { listInviteExtensions, logInviteExtensionFailure } from "./registry";
import type {
  InviteExtensionContext,
  InviteExtensionInfo,
  InviteExtensionPayloads,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Payloads cross module boundaries as per-context views, which
// `isDeepStrictEqual` refuses to equate with plain data holding the same
// values: both sides are compared as plain JSON.
function isSamePayload(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(
    JSON.parse(JSON.stringify(a ?? null)),
    JSON.parse(JSON.stringify(b ?? null)),
  );
}

/**
 * The payloads stored on a pending invitation as values of its edit form: each
 * registered extension's stored slice, under the prefixed ids its fields carry
 * in the form. Payloads of an extension that is no longer registered have no
 * field to fill and are left out.
 */
export function ReadInviteExtensionFields(
  payloads: InviteExtensionPayloads | null | undefined,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const info of listInviteExtensions()) {
    const stored = payloads?.[info.key];
    if (!isRecord(stored)) continue;
    for (const [fieldId, value] of Object.entries(stored)) {
      values[inviteExtensionFieldId(info.key, fieldId)] = value;
    }
  }
  return values;
}

/**
 * Pull the slices an admin changed out of the edit form of a pending
 * invitation, each validated against its extension's schema.
 *
 * Only editable extensions whose fields the submission carries are taken: a
 * body without them — an API client, a form opened before the extension
 * registered — leaves the stored payload alone rather than resetting it. The
 * slice is kept as submitted, as {@link CollectInviteExtensionPayloads} does.
 *
 * @returns The new payloads, keyed by extension key, to store over the old ones
 * @throws HTTPResult 400 when a slice does not satisfy its schema
 */
export function CollectInviteExtensionEdits(
  body: unknown,
): InviteExtensionPayloads {
  const source = isRecord(body) ? body : {};
  const edits: InviteExtensionPayloads = {};

  for (const info of listInviteExtensions()) {
    if (info.editable === false) continue;
    const slice = sliceOf(info.key, source);
    if (Object.keys(slice).length === 0) continue;
    assertSliceValid(info, slice);
    edits[info.key] = slice;
  }

  return edits;
}

async function notifyUpdate(
  info: InviteExtensionInfo,
  previous: InviteExtensionPayloads | null | undefined,
  edits: InviteExtensionPayloads,
  context: InviteExtensionContext,
): Promise<void> {
  if (!info.onUpdate) return;
  if (!(info.key in edits)) return;
  if (isSamePayload(previous?.[info.key], edits[info.key])) return;

  const payload = readPayload(info, edits, {});
  if (!payload) return;
  await info.onUpdate(
    payload.value,
    readPayload(info, previous, {})?.value,
    context,
  );
}

/**
 * Tell every extension whose payload an edit changed, once the edit is stored.
 *
 * A failing handler is logged and the others still run: the invitation already
 * carries the new payload, which is what acceptance delivers either way.
 */
export async function NotifyInviteExtensionUpdates(
  previous: InviteExtensionPayloads | null | undefined,
  edits: InviteExtensionPayloads,
  context: InviteExtensionContext,
): Promise<void> {
  for (const info of listInviteExtensions()) {
    try {
      await notifyUpdate(info, previous, edits, context);
    } catch (error) {
      logInviteExtensionFailure(info.key, "handle its payload update", error);
    }
  }
}
