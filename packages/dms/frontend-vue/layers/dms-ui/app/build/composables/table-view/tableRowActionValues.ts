import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { describeTableWriteError } from "./utils/writeError";
export const DEFAULT_ROW_ID_KEY = "_id";

export const getItemId = (
  item: Data,
  idKey: string = DEFAULT_ROW_ID_KEY,
): string | undefined => {
  return get(item, idKey) ?? item._id ?? item.id;
};

export const getErrorPayload = (
  error: Parameters<typeof describeTableWriteError>[0],
) => {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Rejections may be arbitrary JavaScript values, not EventError instances. Its owner describes only the fields forwarded here; inference cannot prove them, and validation would change primitive and malformed-error payloads.
  const err = error as EventError;
  return err?.data || err?.message;
};
