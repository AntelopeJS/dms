import { HTTPResult } from "@antelopejs/interface-api";
import type { BlockLinkAction } from "@antelopejs/interface-dms/base";

const HTTP_NOT_FOUND = 404;
const HTTP_UNAVAILABLE = 503;
const JSON_TYPE = "application/json";

/** What a 404 body lays over the not-found state a block or a guard draws. */
export interface DemoNotFoundState {
  title: string;
  description?: string;
  icon?: string;
  actions?: BlockLinkAction[];
}

/**
 * A load error: any answer but a 404 makes a block draw its error state with
 * a Retry button.
 */
export function serviceUnavailable(): HTTPResult {
  return new HTTPResult(HTTP_UNAVAILABLE, "Service unavailable");
}

/**
 * A 404 whose body carries a `message` and an `emptyState`: the block draws
 * "Not found" with them laid over it, not a load error.
 */
export function notFound(
  message: string,
  emptyState: DemoNotFoundState,
): HTTPResult {
  return new HTTPResult(
    HTTP_NOT_FOUND,
    JSON.stringify({ message, emptyState }),
    JSON_TYPE,
  );
}
