import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";
import { buildMenuItemTarget } from "#dms-ui/app/build/types/tree";

const NAVIGATION_SOURCE_ID = "dms-navigation";
const NAVIGATION_SOURCE_ORDER = 40;
const NAVIGATION_GROUP_ID = "navigation";
const BREADCRUMB_SEPARATOR = " › ";

function isHiddenFromNavigation(node: SiteLayoutTree): boolean {
  return node.hasAccess === false || node.hidden === true;
}

function collectNavigationItems(
  node: SiteLayoutTree,
  ancestors: string[],
  translate: I18nTranslate,
  items: CommandPaletteItem[],
): void {
  for (const childId of node.childrenOrders) {
    const child = node.children[childId];
    if (!child || isHiddenFromNavigation(child)) continue;

    const label = resolveI18nKey(translate, child.displayName);
    const to = buildMenuItemTarget(child);
    if (to && child.fullSlug) {
      items.push({
        label,
        suffix:
          ancestors.length > 0
            ? ancestors.join(BREADCRUMB_SEPARATOR)
            : undefined,
        icon: child.icon ?? DEFAULT_PAGE_ICON,
        to,
        [COMMAND_PALETTE_SEARCH_TEXT_KEY]: resolveOptionalI18nKey(
          translate,
          child.description,
        ),
      });
    }
    collectNavigationItems(child, [...ancestors, label], translate, items);
  }
}

function buildNavigationGroups(
  tree: SiteLayoutTree | undefined,
  translate: I18nTranslate,
): CommandPaletteGroup[] {
  if (!tree) return [];

  const items: CommandPaletteItem[] = [];
  collectNavigationItems(tree, [], translate, items);
  if (items.length === 0) return [];

  return [
    {
      id: NAVIGATION_GROUP_ID,
      label: translate("commandPalette.groups.navigation", {}),
      items,
    },
  ];
}

export default defineDmsPlugin(() => {
  const { translate } = getPluginI18n();
  const { siteLayoutTree } = useSiteLayout();

  const groups = computed<CommandPaletteGroup[]>(() =>
    buildNavigationGroups(siteLayoutTree.value, translate),
  );

  registerCommandPaletteSource({
    id: NAVIGATION_SOURCE_ID,
    order: NAVIGATION_SOURCE_ORDER,
    groups: () => groups.value,
  });
});
