import type { BlockText } from "@antelopejs/interface-dms/base/types/composed-text";
import type { JsonValue } from "@antelopejs/interface-dms/base/types/json";
import { z } from "zod";

const PLAIN_TEXT = z.string();

/**
 * The value when it is a plain string, else `fallback`: a field of the data
 * a client sent, or a label that may be a composed text.
 */
export function plainText(
  value: JsonValue | BlockText | undefined,
  fallback = "",
): string {
  const text = PLAIN_TEXT.safeParse(value);
  return text.success ? text.data : fallback;
}
