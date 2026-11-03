import { isDeepStrictEqual } from "node:util";
import { inviteExtensionFieldId } from "./field-ids";
import type { InviteExtensionJson } from "../../invite-extension-payloads";
import { isNull, isObject } from "../../utils/internal/type-check";
import {
  assertSliceValid,
  isInviteFieldValues,
  payloadOf,
  readPayload,
  sliceOf,
} from "./payload-slices";
import { listInviteExtensions, logInviteExtensionFailure } from "./registry";
import type { InviteExtensionContext, InviteExtensionPayloads } from "../types";
import type { InviteExtensionInfo, InviteFieldValues } from "./types";

function isStoredSlice(
  value: InviteExtensionJson | undefined,
): value is InviteFieldValues {
  return isObject(value) && !isNull(value) && !Array.isArray(value);
}

function isSamePayload(
  a: InviteExtensionJson | undefined,
  b: InviteExtensionJson | undefined,
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
): InviteFieldValues {
  const values: InviteFieldValues = {};
  for (const info of listInviteExtensions()) {
    const stored = payloadOf(payloads, info.key);
    if (!isStoredSlice(stored)) continue;
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
 *
 * @internal
 */
export function CollectInviteExtensionEdits(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published submission boundary accepts arbitrary bodies and validates each present slice with its extension schema.
  body: unknown,
): InviteExtensionPayloads {
  const source = isInviteFieldValues(body) ? body : {};
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
  if (!Object.hasOwn(edits, info.key)) return;
  if (isSamePayload(payloadOf(previous, info.key), payloadOf(edits, info.key)))
    return;

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
