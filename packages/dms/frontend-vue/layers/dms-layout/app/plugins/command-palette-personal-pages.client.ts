import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";

const PERSONAL_PAGES_SOURCE_ID = "dms-personal-pages";
const PERSONAL_PAGES_SOURCE_ORDER = 20;
const FAVORITES_GROUP_ID = "favorite-pages";
const RECENT_MODULES_GROUP_ID = "recent-modules";

type AccessibleModules = Record<string, ModuleWithAccess> | undefined;

type PathLabelResolver = (path: string) => string | undefined;

function buildFavoritesGroup(
  favorites: FavoritePage[],
  translate: I18nTranslate,
): CommandPaletteGroup | null {
  if (favorites.length === 0) return null;

  return {
    id: FAVORITES_GROUP_ID,
    label: translate("menu.favorites", {}),
    items: favorites.map((favorite) => ({
      label: resolveI18nKey(translate, favorite.title),
      icon: favorite.icon ?? DEFAULT_PAGE_ICON,
      to: favorite.path,
    })),
  };
}

function buildRecentModuleItem(
  entry: ModuleHistoryEntry,
  modules: AccessibleModules,
  translate: I18nTranslate,
  resolvePathLabel: PathLabelResolver,
): CommandPaletteItem | null {
  const module = modules?.[entry.moduleId];
  if (!module?.hasAccess) return null;

  return {
    label: resolveI18nKey(translate, module.title),
    suffix: resolvePathLabel(entry.path),
    icon: module.icon,
    to: entry.path,
  };
}

function buildRecentModulesGroup(
  entries: ModuleHistoryEntry[],
  modules: AccessibleModules,
  translate: I18nTranslate,
  resolvePathLabel: PathLabelResolver,
): CommandPaletteGroup | null {
  const items = entries
    .slice()
    .reverse()
    .map((entry) =>
      buildRecentModuleItem(entry, modules, translate, resolvePathLabel),
    )
    .filter((item): item is CommandPaletteItem => item !== null);
  if (items.length === 0) return null;

  return {
    id: RECENT_MODULES_GROUP_ID,
    label: translate("commandPalette.groups.recentModules", {}),
    items,
  };
}

export default defineDmsPlugin(() => {
  const { translate } = getPluginI18n();
  const { sortedFavorites } = useFavoritePages();
  const { entries } = useModuleHistory();
  const { modules, findMatchingRoute } = useSiteLayout();

  const resolvePathLabel: PathLabelResolver = (path) => {
    const match = findMatchingRoute(path);
    if (!match) return undefined;
    return resolveI18nKey(translate, match.metadata.displayName);
  };

  const groups = computed<CommandPaletteGroup[]>(() =>
    [
      buildFavoritesGroup(sortedFavorites.value, translate),
      buildRecentModulesGroup(
        entries.value,
        modules.value,
        translate,
        resolvePathLabel,
      ),
    ].filter((group): group is CommandPaletteGroup => group !== null),
  );

  registerCommandPaletteSource({
    id: PERSONAL_PAGES_SOURCE_ID,
    order: PERSONAL_PAGES_SOURCE_ORDER,
    groups: () => groups.value,
  });
});
