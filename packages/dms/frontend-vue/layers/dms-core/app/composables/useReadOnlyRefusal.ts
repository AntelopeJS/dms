import { isFunction, isObject } from "../utils/type-check";

const READ_ONLY_STATUS = 403;
const READ_ONLY_HEADER = "x-dms-readonly";
const READ_ONLY_MARK = "1";
const READ_ONLY_TOAST_ID = "dms-read-only";
const READ_ONLY_STATE_KEY = "dms.readOnly.presentedResponses";

function refusedResponse(
  failure: Parameters<typeof isObject>[0],
): object | undefined {
  if (!failure || !isObject(failure)) return;
  const response = failure.response;
  if (!response || !isObject(response) || response.status !== READ_ONLY_STATUS)
    return;
  const headers = response.headers;
  if (!headers || !isObject(headers) || !isFunction(headers.get)) return;
  return headers.get(READ_ONLY_HEADER) === READ_ONLY_MARK
    ? response
    : undefined;
}

/**
 * Captures app-local refusal presentation. The returned consumer shows one
 * generic toast per marked response and returns whether it owns presentation.
 * A consumed refusal remains a failed operation; callers skip only local notices.
 */
export function useReadOnlyRefusal() {
  const toast = useToast();
  const { processApiMessage } = getAppTranslation();
  const presented = useDmsState(
    READ_ONLY_STATE_KEY,
    () => new WeakSet<object>(),
  );

  return (failure: Parameters<typeof refusedResponse>[0]): boolean => {
    const response = refusedResponse(failure);
    if (!response) return false;
    if (presented.value.has(response)) return true;
    presented.value.add(response);
    toast.add({
      id: READ_ONLY_TOAST_ID,
      color: "warning",
      icon: "i-ph-lock-simple",
      title: processApiMessage("error.read_only_demo"),
    });
    return true;
  };
}
