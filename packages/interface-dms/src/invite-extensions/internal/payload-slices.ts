import { assertValidation } from "@antelopejs/interface-api-util";
import {
  inviteExtensionFieldId,
  splitInviteExtensionFieldId,
} from "./field-ids";
import { logInviteExtensionFailure } from "./registry";
import type { InviteDeliveryOptions, InviteExtensionInfo } from "./types";
import type { InviteExtensionPayloads } from "../types";

/** @internal */
export const HTTP_BAD_REQUEST = 400;

interface IssueLike {
  path: Array<string | number>;
  message: string;
}

/** @internal */
export interface StoredPayload {
  value: unknown;
}

function issuesOf(error: Error["cause"]): IssueLike[] | undefined {
  if (error === null || error === undefined) return undefined;
  const issues = Object(error).issues;
  return Array.isArray(issues) ? issues : undefined;
}

/**
 * Report the failure against the ids the browser knows — the prefixed ones it
 * submitted — so the invite form can point at the offending field rather than
 * at a name only the extension uses.
 *
 * An issue raised on the object itself (a schema-wide `refine`) names no field:
 * it keeps an empty path rather than being handed a fabricated one, which the
 * form could not attach to anything either way.
 */
function describeFailure(key: string, error: Error["cause"]) {
  const issues = issuesOf(error);
  if (!issues) return String(error);
  return {
    issues: issues.map(({ path, message }) => ({
      path: path.length
        ? [inviteExtensionFieldId(key, String(path[0])), ...path.slice(1)]
        : [],
      message,
    })),
  };
}

/**
 * The submitted values of one extension's fields, keyed by unprefixed id.
 *
 * @internal
 */
export function sliceOf(
  key: string,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The published slice helper receives raw form values before the extension schema parses them.
  body: Record<string, unknown>,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The published return keeps the submitted values, not transformed schema output.
): Record<string, unknown> {
  const slice: ReturnType<typeof sliceOf> = {};
  for (const [id, value] of Object.entries(body)) {
    const split = splitInviteExtensionFieldId(id);
    if (split?.key === key) {
      slice[split.fieldId] = value;
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The published return contract remains the raw form-value dictionary populated above.
  return slice;
}

/**
 * @throws HTTPResult 400 when the slice does not satisfy the schema
 *
 * @internal
 */
export function assertSliceValid(
  info: InviteExtensionInfo,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This published validation boundary accepts raw fields and parses them with the registering extension's schema below.
  slice: Record<string, unknown>,
): void {
  assertValidation(
    slice,
    (v) => info.schema.parse(v),
    (error) => describeFailure(info.key, error),
    HTTP_BAD_REQUEST,
  );
}

/**
 * Parse the stored submission into the payload `onAccept` is typed for.
 *
 * The schema runs here rather than being trusted from storage: an invitation
 * can outlive the version of the module that wrote its payload, and this is
 * also where a transforming schema produces its output — exactly once, on the
 * input as the admin submitted it.
 *
 * @internal
 */
export function readPayload(
  info: InviteExtensionInfo,
  payloads: InviteExtensionPayloads | null | undefined,
  options: InviteDeliveryOptions,
): StoredPayload | undefined {
  const stored = payloads?.[info.key];
  if (stored === undefined) return undefined;

  const parsed = info.schema.safeParse(stored);
  if (!parsed.success) {
    logInviteExtensionFailure(
      info.key,
      "read its stored payload",
      parsed.error,
    );
    if (options.retryOnFailure) throw parsed.error;
    return undefined;
  }
  return { value: parsed.data };
}
