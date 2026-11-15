import {
  QUICK_ACTION_ADD,
  QUICK_ACTION_BUTTON,
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
} from "../../types/quick-actions";

type QuickActionTargetHandler = (target: QuickActionTarget) => Promise<void>;

const targetHandlers: Record<
  QuickActionTarget["type"],
  QuickActionTargetHandler
> = {
  navigate: async (target) => {
    if (target.type !== "navigate") return;
    return navigateDms({ path: target.to, query: target.query });
  },

  openForm: async (target) => {
    if (target.type !== "openForm") return;
    return navigateDms({
      path: target.to,
      query: {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_ADD,
        [QUICK_ACTION_COMPONENT_KEY]: target.component,
      },
    });
  },
  button: async (target) => {
    if (target.type !== "button") return;
    return navigateDms({
      path: target.to,
      query: {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_BUTTON,
        [QUICK_ACTION_COMPONENT_KEY]: target.component,
        [QUICK_ACTION_BUTTON_KEY]: target.button,
      },
    });
  },
  event: async (target) => {
    if (target.type !== "event") return;
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(target.name, { detail: target.payload }),
    );
  },
};

/**
 * Runs the client-side behavior a quick action declares through its
 * discriminated `target`: `navigate`, `openForm` and `button` route to the
 * action's page, `event` dispatches a window `CustomEvent` in place for whoever
 * listens. A navigation that fails is logged, not thrown.
 *
 * @returns Whether a handler took the target: false for a type none handles.
 */
export function dispatchQuickActionTarget(target: QuickActionTarget): boolean {
  const handler = targetHandlers[target.type];
  if (!handler) return false;
  handler(target).catch((error: unknown) => {
    console.error("[dms] Quick action target failed:", error);
  });
  return true;
}

/**
 * The quick action a key names among those served to the user: its
 * `category:id`, or its bare id when no other category uses it. Undefined for
 * one the user is not served.
 */
export function findServedQuickAction(
  served: Record<string, QuickActionInfo> | undefined,
  key: string,
): QuickActionInfo | undefined {
  if (!served) return undefined;
  const direct = Object.hasOwn(served, key) ? served[key] : undefined;
  return direct ?? Object.values(served).find((entry) => entry.id === key);
}
