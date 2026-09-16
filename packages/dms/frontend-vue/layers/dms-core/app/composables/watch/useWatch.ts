import { isUndefined } from "../../utils/type-check";
import { ComponentId } from "../../types/watch";

function getValueByPath(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function registerEventListeners(
  eventNames: Set<string>,
  handler: EventListener,
) {
  if (isUndefined(window)) return;
  eventNames.forEach((eventName) => {
    window.addEventListener(eventName, handler);
  });
}

function unregisterEventListeners(
  eventNames: Set<string>,
  handler: EventListener,
) {
  if (isUndefined(window)) return;
  eventNames.forEach((eventName) => {
    window.removeEventListener(eventName, handler);
  });
}

interface WatchEventDetail {
  component?: string;
  data?: unknown;
}

function checkParamConditions(
  onParam: WatchAction["onParam"],
  data: unknown,
): boolean {
  if (!onParam) return true;
  const conditions = Array.isArray(onParam) ? onParam : [onParam];
  for (const condition of conditions) {
    const actualValue = getValueByPath(data, condition.key);
    if (actualValue !== condition.value) {
      return false;
    }
  }
  return true;
}

function isMatchingAction(
  action: WatchAction,
  event: CustomEvent,
  detail: WatchEventDetail,
  componentId?: string,
): boolean {
  const component =
    action.component === ComponentId.SELF ? componentId : action.component;
  if (component !== detail.component || action.event !== event.type) {
    return false;
  }
  return checkParamConditions(action.onParam, detail.data);
}

export function useWatch(
  actions: WatchAction[],
  componentId?: string,
  defaultState: Record<string, unknown> = {},
) {
  const isLoading = ref(false);
  const componentState = ref<Record<string, unknown>>(defaultState);
  const { getFunction } = useDefinedFunctions();

  const requiredEvents = new Set<string>(actions.map((action) => action.event));

  function runMatchingActions(
    matchingActions: WatchAction[],
    event: CustomEvent,
  ) {
    isLoading.value = true;
    try {
      for (const action of matchingActions) {
        const actionFn = getFunction(action.functionId) as
          | WatchActionFunction
          | undefined;
        if (!actionFn) {
          continue;
        }
        try {
          actionFn(action, event.detail, componentState);
        } catch {
          /* ignore — a single watch action failure must not break the loop */
        }
      }
    } finally {
      isLoading.value = false;
    }
  }

  function handleWatchEvent(event: CustomEvent) {
    const { detail } = event;
    if (!detail) {
      return;
    }

    const matchingActions = actions.filter((action) =>
      isMatchingAction(action, event, detail, componentId),
    );

    if (matchingActions.length <= 0) {
      return;
    }

    runMatchingActions(matchingActions, event);
  }

  onMounted(() => {
    registerEventListeners(requiredEvents, handleWatchEvent as EventListener);
  });

  onUnmounted(() => {
    unregisterEventListeners(requiredEvents, handleWatchEvent as EventListener);
  });

  return {
    isLoading,
    state: componentState,
  };
}
