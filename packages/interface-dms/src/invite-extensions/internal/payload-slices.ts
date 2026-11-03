import { assertValidation } from "@antelopejs/interface-api-util";
import {
  inviteExtensionFieldId,
  splitInviteExtensionFieldId,
} from "./field-ids";
import type { InviteExtensionJson } from "../../invite-extension-payloads";
import {
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isString,
} from "../../utils/internal/type-check";
import { logInviteExtensionFailure } from "./registry";
import type {
  InviteDeliveryOptions,
  InviteExtensionInfo,
  InviteFieldValues,
} from "./types";
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

function isIssueLike(value: unknown): value is IssueLike {
  return (
    isObject(value) &&
    !isNull(value) &&
    "path" in value &&
    Array.isArray(value.path) &&
    value.path.every((step) => isString(step) || isNumber(step)) &&
    "message" in value &&
    isString(value.message)
  );
}

function hasIssues(error: unknown): error is { issues: IssueLike[] } {
  if (!isObject(error) || isNull(error) || !("issues" in error)) {
    return false;
  }
  const { issues } = error;
  return Array.isArray(issues) && issues.every(isIssueLike);
}

function isPlainObject(value: unknown): value is object {
  if (!isObject(value) || isNull(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isInviteExtensionJson(value: unknown): value is InviteExtensionJson {
  if (isNull(value) || isString(value) || isNumber(value) || isBoolean(value)) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isInviteExtensionJson);
  return (
    isPlainObject(value) && Object.values(value).every(isInviteExtensionJson)
  );
}

/**
 * Whether a submitted body is an object whose every value is JSON, which is
 * all a JSON request body can hold.
 *
 * @internal
 */
export function isInviteFieldValues(
  value: unknown,
): value is InviteFieldValues {
  return (
    isPlainObject(value) &&
    !Array.isArray(value) &&
    Object.values(value).every(isInviteExtensionJson)
  );
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
function describeIssues(key: string, issues: IssueLike[]) {
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
 * The payload an invitation carries for an extension. Only the invitation's own
 * keys count: an extension registered as `constructor` or `toString` is not
 * handed the `Object.prototype` member of that name.
 *
 * @internal
 */
export function payloadOf(
  payloads: InviteExtensionPayloads | null | undefined,
  key: string,
): InviteExtensionJson | undefined {
  return payloads && Object.hasOwn(payloads, key) ? payloads[key] : undefined;
}

/**
 * The submitted values of one extension's fields, keyed by unprefixed id.
 *
 * @internal
 */
export function sliceOf(
  key: string,
  body: InviteFieldValues,
): InviteFieldValues {
  const slice: InviteFieldValues = {};
  for (const [id, value] of Object.entries(body)) {
    const split = splitInviteExtensionFieldId(id);
    if (split?.key === key) {
      slice[split.fieldId] = value;
    }
  }
  return slice;
}

/**
 * @throws HTTPResult 400 when the slice does not satisfy the schema
 *
 * @internal
 */
export function assertSliceValid(
  info: InviteExtensionInfo,
  slice: InviteFieldValues,
): void {
  assertValidation(
    slice,
    (v) => info.schema.parse(v),
    (error) =>
      hasIssues(error) ? describeIssues(info.key, error.issues) : String(error),
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
  const stored = payloadOf(payloads, info.key);
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
