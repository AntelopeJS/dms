export { dispatchQuickActionTarget } from "#dms-ui/app/build/utils/dispatchQuickActionTarget";

export interface QuickActionCategoryGroup {
  category: QuickActionCategoryInfo;
  actions: QuickActionInfo[];
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
