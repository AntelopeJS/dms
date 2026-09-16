/**
 * How an `openForm` quick action reaches its table view: it routes to the
 * action's page with these query parameters, and the table view opens its
 * creation form when it mounts. Carried by the URL rather than a window event
 * so the action works from any page — the listener would otherwise have to
 * exist before the navigation that creates it.
 */
export const QUICK_ACTION_QUERY_KEY = "quickAction";
export const QUICK_ACTION_ADD = "add";
/** Which table view answers, when the page mounts more than one. */
export const QUICK_ACTION_COMPONENT_KEY = "quickActionComponent";
