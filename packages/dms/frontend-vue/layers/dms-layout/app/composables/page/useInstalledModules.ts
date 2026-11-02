import type { ModuleCatalogEntry } from "#dms-core/app/types/page";
import {
  sortStoreModules,
  storeOnlyModules,
  toModuleStoreEntry,
  withStoreDetails,
} from "../../build/utils/module-store-catalog";
import type { useModuleStore } from "./useModuleStore";
import type { useModulesListing } from "./useModulesListing";

/**
 * The installed modules, as the Modules page lists them and the sidebar
 * counts them: the modules that register pages, with the store's details,
 * and the installed store modules that register none, such as the Builder.
 * Both read it here, so the badge and the page never count differently.
 *
 * @param modulesListing The registered modules
 * @param moduleStore The module store
 */
export const useInstalledModules = (
  modulesListing: ReturnType<typeof useModulesListing>,
  moduleStore: Pick<ReturnType<typeof useModuleStore>, "listing">,
) => {
  const { locale } = useI18n();
  const { processI18n } = useTranslation();

  const storeModules = computed(() =>
    sortStoreModules(
      (moduleStore.listing.value?.modules ?? []).map((entry) =>
        toModuleStoreEntry(entry, modulesListing.modules.value ?? []),
      ),
      processI18n,
      locale.value,
    ),
  );

  const modules = computed<ModuleCatalogEntry[]>(() => {
    const registered = withStoreDetails(
      (modulesListing.modules.value ?? []).filter((entry) => entry.hasAccess),
      storeModules.value,
    );
    return [...registered, ...storeOnlyModules(storeModules.value, registered)];
  });

  return { storeModules, modules };
};
