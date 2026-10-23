import type { CommandPaletteGroup } from "@nuxt/ui";
import {
  type RecentModule,
  recentModules,
} from "../build/utils/modules-catalog";

const PERSONAL_PAGES_SOURCE_ID = "dms-personal-pages";
const PERSONAL_PAGES_SOURCE_ORDER = 20;
const FAVORITES_GROUP_ID = "favorite-pages";
const RECENT_MODULES_GROUP_ID = "recent-modules";

function buildFavoritesGroup(
  favorites: FavoritePage[],
  translation: AppTranslation,
): CommandPaletteGroup | null {
  if (favorites.length === 0) return null;

  return {
    id: FAVORITES_GROUP_ID,
    label: translation.t("menu.favorites"),
    items: favorites.map((favorite) => ({
      label: translation.processI18n(favorite.title),
      icon: favorite.icon ?? DEFAULT_PAGE_ICON,
      to: favorite.path,
    })),
  };
}

function buildRecentModulesGroup(
  modules: RecentModule[],
  translation: AppTranslation,
): CommandPaletteGroup | null {
  if (modules.length === 0) return null;

  return {
    id: RECENT_MODULES_GROUP_ID,
    label: translation.t("commandPalette.groups.recentModules"),
    items: modules.map((module) => ({
      label: translation.processI18n(module.title),
      icon: module.icon,
      to: module.to,
    })),
  };
}

export default defineDmsPlugin(() => {
  const translation = getAppTranslation();
  const { sortedFavorites } = useFavoritePages();
  const { entries } = useModuleHistory();
  const { modules, siteLayoutTree } = useSiteLayout();

  const groups = computed<CommandPaletteGroup[]>(() =>
    [
      buildFavoritesGroup(sortedFavorites.value, translation),
      buildRecentModulesGroup(
        recentModules(entries.value, modules.value, siteLayoutTree.value),
        translation,
      ),
    ].filter((group): group is CommandPaletteGroup => group !== null),
  );

  registerCommandPaletteSource({
    id: PERSONAL_PAGES_SOURCE_ID,
    order: PERSONAL_PAGES_SOURCE_ORDER,
    groups: () => groups.value,
  });
});
