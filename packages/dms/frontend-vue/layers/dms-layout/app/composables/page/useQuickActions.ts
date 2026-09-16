import {
  QUICK_ACTION_ADD,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
} from "#dms-ui/app/types/quick-actions";

export interface QuickActionCategoryGroup {
  category: QuickActionCategoryInfo;
  actions: QuickActionInfo[];
}

type QuickActionTargetHandler = (target: QuickActionTarget) => unknown;

const targetHandlers: Record<
  QuickActionTarget["type"],
  QuickActionTargetHandler
> = {
  navigate: (target) => {
    if (target.type !== "navigate") return;
    return navigateDms({ path: target.to, query: target.query });
  },
  // Routed rather than broadcast: the table view reads the intent from the
  // query on mount, so the action works from any page — a window event would
  // have to outrace the navigation it needs.
  openForm: (target) => {
    if (target.type !== "openForm") return;
    return navigateDms({
      path: target.to,
      query: {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_ADD,
        [QUICK_ACTION_COMPONENT_KEY]: target.component,
      },
    });
  },
  event: (target) => {
    if (target.type !== "event") return;
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(target.name, { detail: target.payload }),
    );
  },
};

/**
 * Runs the client-side behavior a quick action declares through its
 * discriminated `target`: `navigate` and `openForm` route to the action's
 * page, `event` dispatches a window `CustomEvent` in place for whoever
 * listens.
 */
export function dispatchQuickActionTarget(target: QuickActionTarget): unknown {
  const handler = targetHandlers[target.type];
  return handler?.(target);
}

function byOrder<T extends { order?: number }>(a: T, b: T): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

function groupActionsByCategory(
  actions: Record<string, QuickActionInfo>,
): Map<string, QuickActionInfo[]> {
  const actionsByCategory = new Map<string, QuickActionInfo[]>();
  for (const action of Object.values(actions)) {
    const bucket = actionsByCategory.get(action.category.id) ?? [];
    bucket.push(action);
    actionsByCategory.set(action.category.id, bucket);
  }
  return actionsByCategory;
}

/**
 * Quick actions the current user can access, grouped by category and sorted
 * by `order` — the shared source for every quick-action surface (header
 * popover, command palette).
 */
export function useQuickActions() {
  const { quickActions } = useSiteLayout();

  const categoryGroups = computed<QuickActionCategoryGroup[]>(() => {
    const payload = quickActions.value;
    if (!payload) return [];

    const actionsByCategory = groupActionsByCategory(payload.actions);

    return Object.values(payload.categories)
      .filter((category) => actionsByCategory.has(category.id))
      .sort(byOrder)
      .map((category) => ({
        category,
        actions: [...(actionsByCategory.get(category.id) ?? [])].sort(byOrder),
      }));
  });

  return { categoryGroups };
}
