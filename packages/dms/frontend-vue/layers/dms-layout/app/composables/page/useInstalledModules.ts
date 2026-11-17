import type { StoreListing } from "#dms-core/app/types/module-store";
import type { ModuleCatalogEntry } from "#dms-core/app/types/page";
import type { Ref } from "vue";
import {
  sortStoreModules,
  storeOnlyModules,
  toModuleStoreEntry,
  withStoreDetails,
} from "../../build/utils/module-store-catalog";
import { ENDPOINT_STORE_LISTING } from "./useModuleStore";
import { useModulesListing } from "./useModulesListing";

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
  moduleStore: { listing: Readonly<Ref<StoreListing | undefined>> },
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

/**
 * How many modules are installed, for the sidebar's badge. The store listing
 * waits on the npm registry, so a server render must not wait for it: the
 * browser reads it, and the count shows once mounted and the read is over,
 * whether it answered or failed. Until then the badge is absent, on the server
 * and on the browser's first render, which a page that handed the listing
 * over (the Modules page) would otherwise have filled in and mismatched, and
 * while the read runs, so the count never shows without the store's modules.
 */
export const useInstalledModuleCount = () => {
  const isOwner = useIsOwner();
  const storeListing = useApiData<StoreListing>(
    () => (isOwner.value ? ENDPOINT_STORE_LISTING : null),
    { server: false },
  );
  const { modules } = useInstalledModules(useModulesListing(), {
    listing: computed(() => storeListing.data.value ?? undefined),
  });
  const isMounted = ref(false);
  onMounted(() => (isMounted.value = true));
  const isSettled = computed(
    () =>
      storeListing.status.value === "success" ||
      storeListing.status.value === "error",
  );
  return computed(() =>
    isMounted.value && isSettled.value ? modules.value.length : 0,
  );
};
