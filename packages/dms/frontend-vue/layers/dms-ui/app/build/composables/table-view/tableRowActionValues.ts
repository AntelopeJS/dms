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

const asRowId = (value: unknown): string | undefined => {
  if (isString(value)) return value;
  if (isNumber(value)) return String(value);
  return undefined;
};

const asErrorPayload = (value: unknown): ErrorPayload | undefined => {
  if (isString(value) || isNumber(value) || isBoolean(value)) return value;
  return isObject(value) && !isNull(value) ? value : undefined;
};

export const getItemId = (
  item: Data,
  idKey: string = DEFAULT_ROW_ID_KEY,
): string | undefined => {
  return asRowId(get(item, idKey)) ?? asRowId(item._id) ?? asRowId(item.id);
};

export const getErrorPayload = (error: unknown): ErrorPayload | undefined => {
  if (!isObject(error) || isNull(error)) return undefined;
  return asErrorPayload(error.data || error.message);
};
