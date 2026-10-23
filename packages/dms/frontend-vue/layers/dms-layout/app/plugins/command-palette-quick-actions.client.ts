import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";

const QUICK_ACTIONS_SOURCE_ID = "dms-quick-actions";
const QUICK_ACTIONS_SOURCE_ORDER = 10;
const QUICK_ACTIONS_GROUP_PREFIX = "quick-actions";

function buildActionItem(
  action: QuickActionInfo,
  translation: AppTranslation,
): CommandPaletteItem {
  return {
    label: translation.processI18n(action.displayName),
    icon: action.icon,
    onSelect: () => {
      void dispatchQuickActionTarget(action.target);
    },
  };
}

function buildQuickActionGroups(
  categoryGroups: QuickActionCategoryGroup[],
  translation: AppTranslation,
): CommandPaletteGroup[] {
  return categoryGroups.map((group) => ({
    id: `${QUICK_ACTIONS_GROUP_PREFIX}-${group.category.id}`,
    label: translation.processI18n(group.category.displayName),
    items: group.actions.map((action) => buildActionItem(action, translation)),
  }));
}

export default defineDmsPlugin(() => {
  const translation = getAppTranslation();
  const { categoryGroups } = useQuickActions();

  const groups = computed<CommandPaletteGroup[]>(() =>
    buildQuickActionGroups(categoryGroups.value, translation),
  );

  registerCommandPaletteSource({
    id: QUICK_ACTIONS_SOURCE_ID,
    order: QUICK_ACTIONS_SOURCE_ORDER,
    groups: () => groups.value,
  });
});
