import { isNumber, isObject } from "../../../../dms-core/app/utils/type-check";

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

/** The HTTP status a failed request carries, wherever the fetch client puts it; undefined for a failure that is no response. */
export function fetchStatus(cause: unknown): number | undefined {
  if (!isRecord(cause)) return undefined;
  const response = isRecord(cause.response) ? cause.response : {};
  return [cause.status, cause.statusCode, response.status].find(isNumber);
}
