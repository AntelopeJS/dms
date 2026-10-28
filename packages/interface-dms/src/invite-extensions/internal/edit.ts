import { isDeepStrictEqual } from "node:util";
import { inviteExtensionFieldId } from "./field-ids";
import { assertSliceValid, readPayload, sliceOf } from "./payload-slices";
import { listInviteExtensions, logInviteExtensionFailure } from "./registry";
import type { InviteExtensionContext, InviteExtensionPayloads } from "../types";
import type { InviteExtensionInfo } from "./types";

function isRecord(
  value: Parameters<typeof CollectInviteExtensionEdits>[0],
): value is ReturnType<typeof ReadInviteExtensionFields> {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This guard is the raw submission boundary and preserves the existing object-but-not-array classification.
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSamePayload(
  a: InviteExtensionPayloads[string],
  b: InviteExtensionPayloads[string],
): boolean {
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
 *
 * @internal
 */
export function ReadInviteExtensionFields(
  payloads: InviteExtensionPayloads | null | undefined,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The published form reader returns raw stored fields so edit round trips do not transform extension input.
): Record<string, unknown> {
  const values: ReturnType<typeof ReadInviteExtensionFields> = {};
  for (const info of listInviteExtensions()) {
    const stored = payloads?.[info.key];
    if (!isRecord(stored)) continue;
    for (const [fieldId, value] of Object.entries(stored)) {
      values[inviteExtensionFieldId(info.key, fieldId)] = value;
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- Preserve the published raw-field dictionary return contract rather than narrow the stored extension values.
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
 *
 * @internal
 */
export function CollectInviteExtensionEdits(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published submission boundary accepts arbitrary bodies and validates each present slice with its extension schema.
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
 *
 * @internal
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
