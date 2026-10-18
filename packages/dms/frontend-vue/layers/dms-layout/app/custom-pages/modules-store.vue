<script setup lang="ts">
import { MONO_CHIP_CLASS } from "#dms-ui/app/build/utils/monoChip";
import UButton from "@nuxt/ui/components/Button.vue";
import DmsEmptyState from "#dms-ui/app/components/empty-state/EmptyState.vue";
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import DmsChipGroup from "#dms-ui/app/build/components/form/ChipGroup.vue";
import DmsSearchInput from "#dms-ui/app/build/components/form/SearchInput.vue";
import ModuleStoreTile from "../build/components/pages/modules/ModuleStoreTile.vue";
import ModuleStoreBanners from "../build/components/pages/modules/ModuleStoreBanners.vue";
import { usePageHeaderActions } from "../composables/layout/usePageHeaderActions";
import { useModuleStore } from "../composables/page/useModuleStore";
import { useModuleStoreActions } from "../composables/page/useModuleStoreActions";
import {
  MODULE_CATEGORY_ALL,
  MODULES_PAGE_PATH,
  filterModules,
  installedModuleLink,
  moduleCategoryOptions,
} from "../build/utils/modules-catalog";
import {
  type StoreScope,
  filterByScope,
  sortStoreModules,
  toModuleStoreEntry,
} from "../build/utils/module-store-catalog";

// The module store, its own view under the Modules page: the official
// AntelopeJS modules, to discover and install. An installed one links to its
// tile among the installed modules, the one place a module is managed.

const SKELETON_PLACEHOLDER_COUNT = 6;
// Wider than the installed grid's tiles: a store tile is read, not scanned,
// so three columns on a laptop give its description and footer room. The
// min() keeps one column from overflowing a phone.
const TILE_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4";
const TOOLBAR_CLASS = "mb-[18px] flex flex-wrap items-center gap-2.5";

const { t, locale } = useI18n();
const { processI18n } = useTranslation();
const isOwner = useIsOwner();
const siteLayout = useSiteLayout();
const moduleStore = useModuleStore();

// Before the first await: the header renders these in the server pass.
usePageHeaderActions(() => {
  if (!isOwner.value) return null;
  const listing = moduleStore.listing.value;
  const frontendVersion = listing?.frontendVersion;
  const source = listing?.frontendVersionSource;
  const back = h(UButton, {
    label: t("modules.store.back"),
    icon: "i-ph-arrow-left",
    to: MODULES_PAGE_PATH,
    color: "neutral",
    variant: "outline",
    ui: { label: "max-sm:sr-only" },
    "aria-label": t("modules.store.back"),
  });
  if (!frontendVersion) return [back];
  return [
    h(
      "span",
      {
        class: [
          MONO_CHIP_CLASS,
          "text-dimmed border border-(--ui-border) text-[11px] max-sm:hidden",
        ],
        title: source
          ? t(`modules.store.frontend_version.${source}`)
          : undefined,
      },
      t("modules.store.frontend_version.label", { version: frontendVersion }),
    ),
    back,
  ];
});

if (!siteLayout.siteLayout.value) {
  await siteLayout.loadSiteLayout();
}

// Like the Modules page, the store is for platform owners only: anyone else
// gets the standard 403 page.
if (!isOwner.value) {
  throw showDmsError({
    statusCode: HTTP_FORBIDDEN,
    statusMessage: "Access denied",
  });
}

onMounted(() => void moduleStore.load());
onBeforeUnmount(() => moduleStore.stop());

const storeListing = computed(() => moduleStore.listing.value);
const isStoreLoading = computed(
  () => storeListing.value === undefined && !moduleStore.loadingError.value,
);
const storeModules = computed(() =>
  sortStoreModules(
    (storeListing.value?.modules ?? []).map((entry) =>
      toModuleStoreEntry(entry, Object.values(siteLayout.modules.value ?? {})),
    ),
    processI18n,
    locale.value,
  ),
);
const { runStoreAction, frontendNotice } = useModuleStoreActions(
  moduleStore,
  storeModules,
);

const storeScope = ref<StoreScope>("all");
const storeQuery = ref("");
const storeCategory = ref<string>(MODULE_CATEGORY_ALL);

const storeScopeItems = computed(() =>
  (["all", "available", "installed"] as const).map((scope) => ({
    value: scope,
    label: t(`modules.store.scope.${scope}`, {
      count: filterByScope(storeModules.value, scope).length,
    }),
  })),
);
const scopedStoreModules = computed(() =>
  filterByScope(storeModules.value, storeScope.value),
);

const storeCategoryOptions = computed(() => [
  {
    value: MODULE_CATEGORY_ALL,
    label: t("modules.category.all"),
    count: scopedStoreModules.value.length,
  },
  ...moduleCategoryOptions(scopedStoreModules.value, processI18n),
]);

// A category that disappeared on refresh must not leave the grid empty.
watch(storeCategoryOptions, (options) => {
  if (!options.some((option) => option.value === storeCategory.value)) {
    storeCategory.value = MODULE_CATEGORY_ALL;
  }
});

const visibleStoreModules = computed(() =>
  filterModules(scopedStoreModules.value, {
    query: storeQuery.value,
    category: storeCategory.value,
    resolve: processI18n,
  }),
);
const trimmedStoreQuery = computed(() => storeQuery.value.trim());

function clearStoreFilters(): void {
  storeQuery.value = "";
  storeCategory.value = MODULE_CATEGORY_ALL;
}

const skeletonItems = Array.from(
  { length: SKELETON_PLACEHOLDER_COUNT },
  (_, index) => index,
);
</script>

<template>
  <div class="pb-20">
    <!-- The page header names the store: no section title repeats it. -->
    <section :aria-label="t('modules.store.title')">
      <ModuleStoreBanners
        :listing="storeListing"
        :frontend-notice="frontendNotice"
      />

      <div v-if="isStoreLoading" :class="TILE_GRID_CLASS" aria-busy="true">
        <DmsCard
          v-for="placeholder in skeletonItems"
          :key="placeholder"
          :padded="false"
          class="flex min-h-[228px] flex-col gap-3 p-4"
        >
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            class="size-9 rounded-[10px]"
          />
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            class="mt-auto h-2.5 w-3/5"
          />
        </DmsCard>
      </div>

      <!-- Only when nothing is on screen yet: a follow-up read that fails
           while the frontend restarts keeps the tiles and tries again. -->
      <DmsBanner
        v-else-if="moduleStore.loadingError.value && !storeListing"
        tone="error"
        size="sm"
        icon="i-ph-plugs"
        :title="t('modules.store.load_error')"
      >
        <template #actions>
          <UButton
            color="error"
            size="sm"
            icon="i-ph-arrows-clockwise"
            :label="t('modules.error.retry')"
            @click="moduleStore.load()"
          />
        </template>
      </DmsBanner>

      <template v-else>
        <div :class="TOOLBAR_CLASS">
          <!-- The store view has no settings menu: "/" is this search's. -->
          <DmsSearchInput
            v-model="storeQuery"
            size="sm"
            :placeholder="t('modules.store.search_placeholder')"
            shortcut="nav"
            class="w-[300px] max-md:w-full"
          />
          <DmsSegmented
            v-model="storeScope"
            :items="storeScopeItems"
            size="sm"
            :aria-label="t('modules.store.scope.label')"
          />
          <DmsChipGroup
            :items="storeCategoryOptions"
            :selected="[storeCategory]"
            :label="t('modules.store.category_label')"
            @pick="storeCategory = $event"
          />
        </div>

        <DmsCard
          v-if="scopedStoreModules.length === 0 && storeScope === 'available'"
          :padded="false"
        >
          <DmsEmptyState
            icon="i-ph-check-circle"
            :title="t('modules.store.all_installed.title')"
            :description="t('modules.store.all_installed.description')"
          />
        </DmsCard>

        <DmsCard v-else-if="visibleStoreModules.length === 0" :padded="false">
          <DmsEmptyState
            variant="no-result"
            :title="
              trimmedStoreQuery
                ? t('modules.store.no_result.title', {
                    query: trimmedStoreQuery,
                  })
                : t('modules.store.no_result.title_filtered')
            "
          >
            <template #actions>
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                :label="t('modules.no_result.clear')"
                @click="clearStoreFilters"
              />
            </template>
          </DmsEmptyState>
        </DmsCard>

        <div v-else :class="TILE_GRID_CLASS">
          <ModuleStoreTile
            v-for="entry in visibleStoreModules"
            :key="entry.id"
            :entry="entry"
            :installed-to="installedModuleLink(entry.id)"
            :is-locked="
              !storeListing?.enabled ||
              (storeListing?.busy === true && entry.state !== 'busy')
            "
            @action="runStoreAction($event, entry)"
          />
        </div>
      </template>
    </section>
  </div>
</template>
