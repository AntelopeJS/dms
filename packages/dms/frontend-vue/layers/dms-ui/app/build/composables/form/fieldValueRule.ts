import type { WatchAction } from "#dms-core/app/types/watch";
import { isString, isNumber, isBoolean, isObject } from "#dms-core/app/utils/type-check";

/** What a `SetFieldValue` watch writes, and where. */
export interface SetFieldValueParams {
  targetField: string;
  value?: unknown;
  valueMap?: object;
}

/** The own member `key` of `source`, wrapped so that an absent one stays apart from an `undefined` one. */
function ownMember(
  source: object,
  key: string,
): { value: unknown } | undefined {
  return isObject(source) && Object.hasOwn(source, key)
    ? { value: source[key] }
    : undefined;
}

/** What a field-state watch (`SetFieldDisabled`, `SetFieldHidden`, `SetFieldRequired`) sets, and on which field. */
export interface FieldFlagParams {
  targetField: string;
  flag: boolean;
}

/**
 * The params a field-state watch carries, read by the name of its flag
 * (`setDisabled`, `setHidden`, `setRequired`). Nothing when the watch names no
 * string `targetField`.
 */
export function readFieldFlagParams(
  params: WatchAction["params"],
  flagKey: string,
): FieldFlagParams | undefined {
  if (!params || !("targetField" in params)) return undefined;
  const { targetField } = params;
  if (!isString(targetField)) return undefined;
  return { targetField, flag: !!ownMember(params, flagKey)?.value };
}

/**
 * The params a `SetFieldValue` watch carries. Nothing when the watch names no
 * string `targetField`, or a `valueMap` that is not an object.
 */
export function readSetFieldValueParams(
  params: WatchAction["params"],
): SetFieldValueParams | undefined {
  if (!params || !("targetField" in params)) return undefined;
  const { targetField } = params;
  if (!isString(targetField)) return undefined;
  const decoded: SetFieldValueParams = { targetField };
  if ("value" in params && Object.hasOwn(params, "value")) {
    decoded.value = params.value;
  }
  if ("valueMap" in params && params.valueMap) {
    const { valueMap } = params;
    if (!isObject(valueMap)) return undefined;
    decoded.valueMap = valueMap;
  }
  return decoded;
}

/** The payload of a form's `FieldChange` event. */
export interface FieldChangePayload {
  fieldId?: string;
  value?: unknown;
  /** The field still holds the value the form started from. */
  initial?: boolean;
}

/** A value to write, or nothing to write. */
export type FieldValueWrite = { value: unknown } | undefined;

type MapKey = string | number | boolean;

function isMapKey(value: FieldChangePayload["value"]): value is MapKey {
  return isString(value) || isNumber(value) || isBoolean(value);
}

/**
 * What a `SetFieldValue` watch writes for a field change: its `value`, or the
 * entry of its `valueMap` named by the changed field's value. Nothing on a
 * value the form started from — the record keeps what it stored — nor for a
 * value the map has no entry for.
 */
export function resolveFieldValueWrite(
  params: SetFieldValueParams,
  payload: FieldChangePayload | undefined,
): FieldValueWrite {
  if (payload?.initial) return undefined;
  if (params.valueMap) {
    const key = payload?.value;
    if (!isMapKey(key)) return undefined;
    return ownMember(params.valueMap, String(key));
  }
  if (!Object.hasOwn(params, "value")) return undefined;
  return { value: params.value };
}

/**
 * Tells, for each `FieldChange` a form sends, whether the field still holds
 * the value it started from and never held another: once a field changed,
 * coming back to that value is a change too.
 */
export function createStartingValueTracker(
  isStartingValue: (
    fieldId: string,
    value: FieldChangePayload["value"],
  ) => boolean,
): (fieldId: string, value: FieldChangePayload["value"]) => boolean {
  const changedFieldIds = new Set<string>();
  return (fieldId, value) => {
    if (changedFieldIds.has(fieldId)) return false;
    if (isStartingValue(fieldId, value)) return true;
    changedFieldIds.add(fieldId);
    return false;
  };
}
