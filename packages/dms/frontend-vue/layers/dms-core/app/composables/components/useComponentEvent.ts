import { isUndefined } from "../../utils/type-check";

function sendComponentEvent(name: string, componentId: string, data?: unknown) {
  if (!isUndefined(window)) {
    const customEvent = new CustomEvent<ComponentEventData>(name, {
      detail: {
        component: componentId,
        data,
      },
    });
    window.dispatchEvent(customEvent);
  }
}

export function useComponentEvent(componentId?: string) {
  if (componentId) {
    onMounted(() => {
      sendComponentEvent(Events.LOAD, componentId);
    });

    onBeforeUnmount(() => {
      sendComponentEvent(Events.UNLOAD, componentId);
    });
  }

  return {
    sendComponentEvent,
  };
}
