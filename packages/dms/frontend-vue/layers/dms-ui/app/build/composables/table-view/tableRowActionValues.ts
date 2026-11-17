import { get } from "@nuxt/ui/runtime/utils/index.js";
import {
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isString,
} from "#dms-core/app/utils/type-check";
export const DEFAULT_ROW_ID_KEY = "_id";

/** What a failed request reports to listeners: its body or its message. */
export type ErrorPayload = string | number | boolean | object;

const isRowId = (value: unknown): value is string | number =>
  isString(value) || isNumber(value);

const isErrorPayload = (value: unknown): value is ErrorPayload =>
  isString(value) ||
  isNumber(value) ||
  isBoolean(value) ||
  (isObject(value) && !isNull(value));

export const getItemId = (
  item: Data,
  idKey: string = DEFAULT_ROW_ID_KEY,
): string | undefined => {
  const id = [get(item, idKey), item._id, item.id].find(isRowId);
  return id === undefined ? undefined : String(id);
};

export const getErrorPayload = (cause: unknown): ErrorPayload | undefined => {
  if (!isObject(cause) || isNull(cause)) return undefined;
  const payload = cause.data || cause.message;
  return isErrorPayload(payload) ? payload : undefined;
};
