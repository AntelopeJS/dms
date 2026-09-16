export interface FavoritePage {
  id: string;
  path: string;
  title: string;
  icon?: string;
}

export const useFavoritePages = () => {
  const cookie = useDmsCookie<FavoritePage[]>("dms-favorite-pages", {
    default: () => [],
  });

  const favorites = useDmsState<FavoritePage[]>(
    "dms-favorite-pages",
    () => cookie.value ?? [],
  );

  const syncToCookie = () => {
    cookie.value = favorites.value;
  };

  const isFavorite = (path: string): boolean => {
    return favorites.value.some((fav) => fav.path === path);
  };

  const toggleFavorite = (page: FavoritePage): boolean => {
    const index = favorites.value.findIndex((fav) => fav.path === page.path);

    if (index !== -1) {
      favorites.value.splice(index, 1);
      syncToCookie();
      return false;
    }

    favorites.value.push(page);
    syncToCookie();
    return true;
  };

  const addFavorite = (page: FavoritePage): void => {
    if (!isFavorite(page.path)) {
      favorites.value.push(page);
      syncToCookie();
    }
  };

  const removeFavorite = (path: string): void => {
    const index = favorites.value.findIndex((fav) => fav.path === path);
    if (index !== -1) {
      favorites.value.splice(index, 1);
      syncToCookie();
    }
  };

  const clearFavorites = (): void => {
    favorites.value = [];
    syncToCookie();
  };

  const sortedFavorites = computed(() => {
    return [...favorites.value].sort((a, b) => a.title.localeCompare(b.title));
  });

  const cleanupInvalidFavorites = (
    isValidPath: (path: string) => boolean,
  ): void => {
    const validFavorites = favorites.value.filter((fav) =>
      isValidPath(fav.path),
    );

    if (validFavorites.length !== favorites.value.length) {
      favorites.value = validFavorites;
      syncToCookie();
    }
  };

  return {
    favorites,
    sortedFavorites,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    clearFavorites,
    cleanupInvalidFavorites,
  };
};
