/**
 * How an `openForm` or `button` quick action reaches its table view: it routes
 * to the action's page with these query parameters, and the table view opens
 * its creation form, or presses the named button, when it mounts. Carried by the URL rather than a window event
 * so the action works from any page — the listener would otherwise have to
 * exist before the navigation that creates it.
 */
export const QUICK_ACTION_QUERY_KEY = "quickAction";
export const QUICK_ACTION_ADD = "add";
/** Which table view answers, when the page mounts more than one. */
export const QUICK_ACTION_COMPONENT_KEY = "quickActionComponent";
export const QUICK_ACTION_BUTTON = "button";
/** Which of the table view's custom buttons a `button` quick action presses. */
export const QUICK_ACTION_BUTTON_KEY = "quickActionButton";

export type QuickActionIntent =
  | { kind: "add" }
  | { kind: "button"; button: string };

type QuickActionQuery = Record<string, unknown>;

const intentReaders: Record<
  string,
  (query: QuickActionQuery) => QuickActionIntent | undefined
> = {
  [QUICK_ACTION_ADD]: () => ({ kind: "add" }),
  [QUICK_ACTION_BUTTON]: (query) => {
    const button = query[QUICK_ACTION_BUTTON_KEY];
    return typeof button === "string" ? { kind: "button", button } : undefined;
  },
};

/**
 * What the route asks the table view `componentId` to run. A page may mount
 * several table views, so the quick action always names the one it means —
 * resolved server-side — and only that one answers.
 */
export function readQuickActionIntent(
  query: QuickActionQuery,
  componentId: string | undefined,
): QuickActionIntent | undefined {
  if (query[QUICK_ACTION_COMPONENT_KEY] !== componentId) return undefined;
  const action = query[QUICK_ACTION_QUERY_KEY];
  if (typeof action !== "string") return undefined;
  return intentReaders[action]?.(query);
}
