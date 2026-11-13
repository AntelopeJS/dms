import type { ComponentEventData } from "../types/component";

interface EventedActionOptions {
  componentId?: string;
  events?: {
    start?: string;
    success?: string;
    error?: string;
  };
}

interface ExecuteOptions<TResult> {
  startPayload?: ComponentEventData["data"];
  successPayload?: (result: TResult) => ComponentEventData["data"];
  errorPayload?: (error: unknown) => ComponentEventData["data"];
}

export function useEventedAction<TResult = unknown>(
  options: EventedActionOptions = {},
) {
  const { sendComponentEvent } = useComponentEvent();
  const isLoading = ref(false);

  function dispatchEvent(
    eventName: string | undefined,
    payload: ComponentEventData["data"],
  ) {
    if (!eventName || !options.componentId) return;
    sendComponentEvent(eventName, options.componentId, payload);
  }

  async function execute(
    action: () => Promise<TResult>,
    executeOptions: ExecuteOptions<TResult> = {},
  ): Promise<TResult> {
    isLoading.value = true;
    dispatchEvent(options.events?.start, executeOptions.startPayload);

    try {
      const result = await action();
      dispatchEvent(
        options.events?.success,
        executeOptions.successPayload?.(result),
      );
      return result;
    } catch (error) {
      dispatchEvent(
        options.events?.error,
        executeOptions.errorPayload?.(error),
      );
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  return { execute, isLoading };
}
