/** What a `SetFieldValue` watch writes, and where. */
export interface SetFieldValueParams {
  targetField: string;
  value?: unknown;
  valueMap?: Record<string, unknown>;
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

function isMapKey(value: unknown): value is MapKey {
  return ["string", "number", "boolean"].includes(typeof value);
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
    if (!isMapKey(key) || !Object.hasOwn(params.valueMap, String(key))) {
      return undefined;
    }
    return { value: params.valueMap[String(key)] };
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
  isStartingValue: (fieldId: string, value: unknown) => boolean,
): (fieldId: string, value: unknown) => boolean {
  const changedFieldIds = new Set<string>();
  return (fieldId, value) => {
    if (changedFieldIds.has(fieldId)) return false;
    if (isStartingValue(fieldId, value)) return true;
    changedFieldIds.add(fieldId);
    return false;
  };
}
