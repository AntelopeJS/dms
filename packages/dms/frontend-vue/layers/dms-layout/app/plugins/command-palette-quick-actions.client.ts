import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";

const QUICK_ACTIONS_SOURCE_ID = "dms-quick-actions";
const QUICK_ACTIONS_SOURCE_ORDER = 10;
const QUICK_ACTIONS_GROUP_PREFIX = "quick-actions";

function buildActionItem(
  action: QuickActionInfo,
  translate: I18nTranslate,
): CommandPaletteItem {
  return {
    label: resolveI18nKey(translate, action.displayName),
    icon: action.icon,
    onSelect: () => {
      void dispatchQuickActionTarget(action.target);
    },
  };
}

function buildQuickActionGroups(
  categoryGroups: QuickActionCategoryGroup[],
  translate: I18nTranslate,
): CommandPaletteGroup[] {
  return categoryGroups.map((group) => ({
    id: `${QUICK_ACTIONS_GROUP_PREFIX}-${group.category.id}`,
    label: resolveI18nKey(translate, group.category.displayName),
    items: group.actions.map((action) => buildActionItem(action, translate)),
  }));
}

export default defineDmsPlugin(() => {
  const { translate } = getPluginI18n();
  const { categoryGroups } = useQuickActions();

  const groups = computed<CommandPaletteGroup[]>(() =>
    buildQuickActionGroups(categoryGroups.value, translate),
  );

  registerCommandPaletteSource({
    id: QUICK_ACTIONS_SOURCE_ID,
    order: QUICK_ACTIONS_SOURCE_ORDER,
    groups: () => groups.value,
  });
});
