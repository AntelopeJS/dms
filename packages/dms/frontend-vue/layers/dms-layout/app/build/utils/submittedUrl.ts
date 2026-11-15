import { isObject, isString } from "#dms-core/app/utils/type-check";

/**
 * The URL a form saved to, read from its `FormEvents.SUBMIT_SUCCESS` event:
 * `detail.data.submitUrl`. Undefined when the event carries no such string.
 */
export function submittedUrlOf(event: Event): string | undefined {
  if (!(event instanceof CustomEvent)) return undefined;
  const detail: unknown = event.detail;
  if (detail === null || !isObject(detail)) return undefined;
  const { data } = detail;
  if (data === null || !isObject(data)) return undefined;
  return isString(data.submitUrl) ? data.submitUrl : undefined;
}
