import { get } from "@nuxt/ui/runtime/utils/index.js";
export const DEFAULT_ROW_ID_KEY = "_id";

export const getItemId = (
  item: Data,
  idKey: string = DEFAULT_ROW_ID_KEY,
): string | undefined => {
  return get(item, idKey) ?? item._id ?? item.id;
};

export const getErrorPayload = (error: unknown) => {
  const err = error as EventError;
  return err?.data || err?.message;
};
