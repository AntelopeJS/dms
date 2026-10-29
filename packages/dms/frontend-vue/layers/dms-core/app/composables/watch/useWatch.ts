import { isUndefined } from "../../utils/type-check";
import { ComponentId } from "../../types/watch";

function getValueByPath(
  obj: WatchEventDetail["data"],
  path: string,
): WatchActionCondition["value"] {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- Event data has no common schema; this unchecked access intentionally retains primitive boxing and arbitrary nested property traversal rather than rejecting non-record values.
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

type WatchEvent = Event & Partial<Pick<CustomEvent, "detail">>;

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

  function runMatchingActions(
    matchingActions: WatchAction[],
    event: WatchEvent,
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
          actionFn(action, event.detail, componentState);
        } catch {
          // eslint-disable-line no-empty -- A synchronous action failure does not stop subsequent actions.
        }
      }
    } finally {
      isLoading.value = false;
    }
  }

  function handleWatchEvent(event: WatchEvent) {
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
