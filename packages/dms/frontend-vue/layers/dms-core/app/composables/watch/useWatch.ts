import { isRecord } from "../../build/utils/record";
import { isNull, isString, isUndefined } from "../../utils/type-check";
import { ComponentId } from "../../types/watch";

function getValueByPath(
  obj: WatchEventDetail["data"],
  path: string,
): WatchActionCondition["value"] {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (isNull(current) || isUndefined(current)) return undefined;
    const target: unknown = Object(current);
    current = isRecord(target) ? target[key] : undefined;
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

type WatchEvent = Event & Partial<Pick<CustomEvent, "detail">>;

function isWatchEventDetail(value: unknown): value is WatchEventDetail {
  return (
    isRecord(value) &&
    (isUndefined(value.component) || isString(value.component))
  );
}

function checkParamConditions(
  onParam: WatchAction["onParam"],
  data: WatchEventDetail["data"],
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
  event: WatchEvent,
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
  defaultState: Parameters<WatchActionFunction>[2]["value"] = {},
) {
  const isLoading = ref(false);
  const componentState = ref(defaultState);
  const { getFunction } = useDefinedFunctions();

  const requiredEvents = new Set<string>(actions.map((action) => action.event));

  /**
   * Runs each matching action in turn. A synchronous action failure does not
   * stop the actions after it.
   */
  function runMatchingActions(
    matchingActions: WatchAction[],
    detail: WatchEventDetail,
  ) {
    isLoading.value = true;
    try {
      for (const action of matchingActions) {
        const actionFn = getFunction(action.functionId);
        if (!actionFn) {
          continue;
        }
        // prettier-ignore
        try {
          actionFn(action, detail, componentState);
        } catch {
          // eslint-disable-line no-empty -- A synchronous action failure does not stop subsequent actions.
        }
      }
    } finally {
      isLoading.value = false;
    }
  }

  function handleWatchEvent(event: WatchEvent) {
    const detail: unknown = event.detail;
    if (!isWatchEventDetail(detail)) {
      return;
    }

    const matchingActions = actions.filter((action) =>
      isMatchingAction(action, event, detail, componentId),
    );

    if (matchingActions.length <= 0) {
      return;
    }

    runMatchingActions(matchingActions, detail);
  }

  onMounted(() => {
    registerEventListeners(requiredEvents, handleWatchEvent);
  });

  onUnmounted(() => {
    unregisterEventListeners(requiredEvents, handleWatchEvent);
  });

  return {
    isLoading,
    state: componentState,
  };
}
