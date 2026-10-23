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
  translation: AppTranslation,
  items: CommandPaletteItem[],
): void {
  for (const childId of node.childrenOrders) {
    const child = node.children[childId];
    if (!child || isHiddenFromNavigation(child)) continue;

    const label = translation.processI18n(child.displayName);
    const to = buildMenuItemTarget(child);
    // The account entries (Settings, Profile) are the session group's.
    if (to && child.fullSlug && !isAccountMenuRoute(to)) {
      items.push({
        label,
        suffix:
          ancestors.length > 0
            ? ancestors.join(BREADCRUMB_SEPARATOR)
            : undefined,
        icon: child.icon ?? DEFAULT_PAGE_ICON,
        to,
        [COMMAND_PALETTE_SEARCH_TEXT_KEY]: resolveOptionalI18nKey(
          translation.t,
          child.description,
        ),
      });
    }
    collectNavigationItems(child, [...ancestors, label], translation, items);
  }
}

function buildNavigationGroups(
  tree: SiteLayoutTree | undefined,
  translation: AppTranslation,
): CommandPaletteGroup[] {
  if (!tree) return [];

  const items: CommandPaletteItem[] = [];
  collectNavigationItems(tree, [], translation, items);
  if (items.length === 0) return [];

  return [
    {
      id: NAVIGATION_GROUP_ID,
      label: translation.t("commandPalette.groups.navigation"),
      items,
    },
  ];
}

export default defineDmsPlugin(() => {
  const translation = getAppTranslation();
  const { siteLayoutTree } = useSiteLayout();

  const groups = computed<CommandPaletteGroup[]>(() =>
    buildNavigationGroups(siteLayoutTree.value, translation),
  );

  registerCommandPaletteSource({
    id: NAVIGATION_SOURCE_ID,
    order: NAVIGATION_SOURCE_ORDER,
    groups: () => groups.value,
  });
});
