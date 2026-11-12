import { isString } from "@antelopejs/interface-dms/utils/internal/type-check";
/**
 * A notification without a title renders as an empty row in the inbox. The
 * builder's types require one, but a caller passing a request body straight
 * through can still hand an empty string or null.
 */
export function hasNotificationTitle(data: { title?: string | null }): boolean {
  return isString(data.title) && data.title.trim().length > 0;
}
