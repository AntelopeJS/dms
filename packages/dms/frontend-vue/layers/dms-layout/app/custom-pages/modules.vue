<script setup lang="ts">
import { MONO_CHIP_CLASS } from "#dms-ui/app/build/utils/monoChip";
import UButton from "@nuxt/ui/components/Button.vue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import DmsEmptyState from "#dms-ui/app/components/empty-state/EmptyState.vue";
import DmsSectionHeader from "#dms-ui/app/components/section-header/SectionHeader.vue";
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import DmsStatGroup, {
  type StatGroupItem,
} from "#dms-ui/app/components/stat-group/StatGroup.vue";
import type { Tone } from "#dms-ui/app/types/tone";
import { useKeyboardPlatform } from "#dms-ui/app/composables/global/keyboardPlatform";
import DmsChipGroup from "#dms-ui/app/build/components/form/ChipGroup.vue";
import ModuleCatalogTile from "../build/components/pages/modules/ModuleCatalogTile.vue";
import ModuleStoreTile from "../build/components/pages/modules/ModuleStoreTile.vue";
import { usePageHeaderActions } from "../composables/layout/usePageHeaderActions";
import {
  ENDPOINT_MODULES_LISTING,
  useModulesListing,
} from "../composables/page/useModulesListing";
import { useModuleHistory } from "../composables/page/useModuleHistory";
import type { ModuleCatalogEntry } from "../types/page";
import {
  MODULE_CATEGORY_ALL,
  filterModules,
  findModulePageMatch,
  moduleCategoryOptions,
  sortModules,
  summarizeModules,
  type ModuleSortMode,
} from "../build/utils/modules-catalog";
import {
  MODULE_STORE_CATALOG,
  availableStoreModules,
} from "../build/utils/module-store-catalog";
import DmsSearchInput from "#dms-ui/app/build/components/form/SearchInput.vue";

const SKELETON_PLACEHOLDER_COUNT = 6;
const MODULES_LISTING_DATA_KEY = "modules-page-listing";

const { t } = useI18n();
const { processI18n } = useTranslation();
const { keyLabel } = useKeyboardPlatform();
const isOwner = useIsOwner();
const homepage = useHomepage();
const siteLayout = useSiteLayout();
const modulesListing = useModulesListing();
const moduleHistory = useModuleHistory();

// Before the first await: the header renders these in the server pass.
usePageHeaderActions(() => {
  if (isForbidden.value) return null;
  return [
    h(
      "span",
      {
        class:
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-(--ui-border-accented) px-[11px] font-mono text-[11px] font-semibold text-toned max-sm:hidden",
      },
      [
        h(UIcon, { name: "i-ph-shield-check", class: "size-3.5" }),
        t("modules.owner_badge"),
      ],
    ),
    h(UButton, {
      label: t("modules.refresh"),
      icon: "i-ph-arrows-clockwise",
      color: "neutral",
      variant: "outline",
      // Icon-only on phones, where the header row has no room for a label.
      ui: { label: "max-sm:sr-only" },
      "aria-label": t("modules.refresh"),
      loading: modulesListing.isLoading.value,
      disabled: modulesListing.modules.value === undefined && !failure.value,
      onClick: retry,
    }),
  ];
});

if (!siteLayout.siteLayout.value) {
  await siteLayout.loadSiteLayout();
}

// Managing modules is for platform owners only: anyone else gets the standard
// 403 page, the same answer as any page they may not open (the entry is not in
// their menu either).
if (!isOwner.value) {
  throw showError({
    statusCode: HTTP_FORBIDDEN,
    statusMessage: "Access denied",
  });
}

// Whatever is cached from an earlier visit shows at once; stale live figures
// are then refreshed in the background on mount. The hydration reuses the
// listing the server rendered: fetched again before hydrating, its live
// readouts (an uptime a minute on) would no longer match the markup.
if (isOwner.value) {
  const { data: renderedListing } = await useDmsAsyncData<
    ModuleCatalogEntry[] | null
  >(MODULES_LISTING_DATA_KEY, async () => {
    await modulesListing.loadModulesListing();
    return modulesListing.modules.value ?? null;
  });
  if (modulesListing.modules.value === undefined) {
    if (renderedListing.value) {
      modulesListing.modules.value = renderedListing.value;
    } else {
      await modulesListing.loadModulesListing();
    }
  }
}

onMounted(() => {
  if (isOwner.value && modulesListing.modules.value !== undefined) {
    void modulesListing.revalidate();
  }
});

const isForbidden = computed(
  () =>
    !isOwner.value || modulesListing.loadingError.value?.kind === "forbidden",
);
const failure = computed(() =>
  modulesListing.loadingError.value?.kind === "failed"
    ? modulesListing.loadingError.value
    : null,
);
const isInitiallyLoading = computed(
  () =>
    modulesListing.modules.value === undefined &&
    !failure.value &&
    !isForbidden.value,
);
const isRetrying = ref(false);

const modules = computed<ModuleCatalogEntry[]>(() =>
  (modulesListing.modules.value ?? []).filter((entry) => entry.hasAccess),
);
const summary = computed(() => summarizeModules(modules.value));

// ── Navigation targets ─────────────────────────────────────────────
function moduleTarget(entry: ModuleCatalogEntry): string {
  return moduleHistory.getLast(entry.id) ?? entry.landingSlug;
}

const visitedAt = computed(
  () =>
    new Map(
      moduleHistory.entries.value.map((visit) => [
        visit.moduleId,
        visit.visitedAt,
      ]),
    ),
);

// The installed modules, their skeleton and the store share one grid and
// one search toolbar.
const TILE_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-4";
const TOOLBAR_CLASS = "mb-[18px] flex flex-wrap items-center gap-2.5";

// ── Search, category, sort ─────────────────────────────────────────
const query = ref("");
const category = ref<string>(MODULE_CATEGORY_ALL);
const sortMode = ref<ModuleSortMode>("recent");

const categoryOptions = computed(() => [
  {
    value: MODULE_CATEGORY_ALL,
    label: t("modules.category.all"),
    count: modules.value.length,
  },
  ...moduleCategoryOptions(modules.value, processI18n),
]);

// A category that disappeared on refresh must not leave the grid empty.
watch(categoryOptions, (options) => {
  if (!options.some((option) => option.value === category.value)) {
    category.value = MODULE_CATEGORY_ALL;
  }
});

const sortItems = computed(() => [
  { value: "recent", label: t("modules.sort.recent") },
  { value: "name", label: t("modules.sort.name") },
]);

const visibleModules = computed(() =>
  sortModules(
    filterModules(modules.value, {
      query: query.value,
      category: category.value,
      resolve: processI18n,
    }),
    sortMode.value,
    visitedAt.value,
    processI18n,
  ),
);

const trimmedQuery = computed(() => query.value.trim());

const pageMatch = computed(() => {
  if (visibleModules.value.length > 0 || !trimmedQuery.value) return null;
  const match = findModulePageMatch(
    siteLayout.siteLayout.value?.pages,
    trimmedQuery.value,
    new Set(modules.value.map((entry) => entry.id)),
    processI18n,
  );
  if (!match) return null;
  const owner = modules.value.find((entry) => entry.id === match.moduleId);
  return owner ? { ...match, moduleTitle: processI18n(owner.title) } : null;
});

function clearFilters(): void {
  query.value = "";
  category.value = MODULE_CATEGORY_ALL;
}

// ── Module store (preview) ─────────────────────────────────────────
// A static list of the official modules not installed here: nothing installs
// yet, only the search and the category chips work, locally.
const storeModules = computed(() =>
  availableStoreModules(
    MODULE_STORE_CATALOG,
    new Set((modulesListing.modules.value ?? []).map((entry) => entry.id)),
    processI18n,
  ),
);
const storeQuery = ref("");
const storeCategory = ref<string>(MODULE_CATEGORY_ALL);

const storeCategoryOptions = computed(() => [
  {
    value: MODULE_CATEGORY_ALL,
    label: t("modules.category.all"),
    count: storeModules.value.length,
  },
  ...moduleCategoryOptions(storeModules.value, processI18n),
]);

watch(storeCategoryOptions, (options) => {
  if (!options.some((option) => option.value === storeCategory.value)) {
    storeCategory.value = MODULE_CATEGORY_ALL;
  }
});

const visibleStoreModules = computed(() =>
  filterModules(storeModules.value, {
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

// ── Actions ────────────────────────────────────────────────────────
async function retry(): Promise<void> {
  if (isRetrying.value) return;
  isRetrying.value = true;
  try {
    await modulesListing.refresh();
  } finally {
    isRetrying.value = false;
  }
}

const failureReason = computed(() =>
  failure.value?.status
    ? t("modules.error.reason_status", { status: failure.value.status })
    : t("modules.error.reason_network"),
);

const skeletonItems = Array.from(
  { length: SKELETON_PLACEHOLDER_COUNT },
  (_, index) => index,
);

const SUMMARY_CARDS: Array<{
  key: keyof ReturnType<typeof summarizeModules>;
  icon: string;
  tone: Tone;
}> = [
  { key: "installed", icon: "i-ph-squares-four", tone: "primary" },
  { key: "updates", icon: "i-ph-arrow-circle-up", tone: "warning" },
  { key: "attention", icon: "i-ph-warning-circle", tone: "error" },
  { key: "beta", icon: "i-ph-flask", tone: "secondary" },
];

const summaryCards = computed<StatGroupItem[]>(() =>
  SUMMARY_CARDS.map(({ key, icon, tone }) => ({
    id: key,
    icon,
    tone,
    eyebrow: t(`modules.summary.${key}`),
    value: summary.value[key],
  })),
);
</script>

<template>
  <div class="pb-20">
    <!-- Not a platform owner: say who manages modules instead of redirecting. -->
    <DmsCard v-if="isForbidden" :padded="false">
      <DmsEmptyState
        variant="no-access"
        :title="t('modules.forbidden.title')"
        :description="t('modules.forbidden.description')"
      >
        <template #actions>
          <UButton
            :to="homepage"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-ph-house"
            :label="t('modules.forbidden.back')"
          />
        </template>
      </DmsEmptyState>
    </DmsCard>

    <!-- Load failure: what failed, what still works, and a retry. -->
    <div v-else-if="failure" role="alert">
      <DmsBanner
        tone="error"
        icon="i-ph-plugs"
        :title="t('modules.error.title')"
      >
        <template #description>
          <i18n-t keypath="modules.error.description" scope="global" tag="span">
            <template #endpoint>
              <code
                :class="[
                  MONO_CHIP_CLASS,
                  'bg-elevated text-highlighted text-xs',
                ]"
              >
                {{ ENDPOINT_MODULES_LISTING }}
              </code>
            </template>
            <template #reason>{{ failureReason }}</template>
          </i18n-t>
        </template>
        <template #actions>
          <UButton
            color="error"
            size="sm"
            icon="i-ph-arrows-clockwise"
            :loading="isRetrying"
            :label="t('modules.error.retry')"
            @click="retry"
          />
        </template>
      </DmsBanner>
    </div>

    <template v-else>
      <!-- Summary counts -->
      <DmsStatGroup
        class="mb-6"
        layout="cards"
        :items="summaryCards"
        :loading="isInitiallyLoading"
      />

      <!-- Installed -->
      <section>
        <DmsSectionHeader
          class="mb-3"
          :title="t('modules.installed.title')"
          :count="isInitiallyLoading ? undefined : modules.length"
          :description="t('modules.installed.description')"
        >
          <template #trailing>
            <DmsSegmented
              v-model="sortMode"
              :items="sortItems"
              size="sm"
              :aria-label="t('modules.sort.label')"
            />
          </template>
        </DmsSectionHeader>

        <div :class="TOOLBAR_CLASS">
          <!-- The Modules page has no settings menu: "/" is this search's. -->
          <DmsSearchInput
            v-model="query"
            size="sm"
            :placeholder="t('modules.search.placeholder')"
            shortcut="nav"
            class="w-[300px] max-md:w-full"
          />
          <DmsChipGroup
            :items="categoryOptions"
            :selected="[category]"
            :label="t('modules.category.label')"
            @pick="category = $event"
          />
        </div>

        <!-- Loading -->
        <div
          v-if="isInitiallyLoading"
          :class="TILE_GRID_CLASS"
          aria-busy="true"
        >
          <DmsCard
            v-for="placeholder in skeletonItems"
            :key="placeholder"
            :padded="false"
            class="flex min-h-[228px] flex-col gap-3 p-4"
          >
            <div class="flex items-start justify-between">
              <USkeleton class="size-9 rounded-[10px]" />
              <USkeleton class="h-5 w-12 rounded-full" />
            </div>
            <USkeleton class="h-2.5 w-4/5" />
            <USkeleton class="h-2.5 w-3/5" />
            <USkeleton class="mt-auto h-4 w-2/5" />
          </DmsCard>
        </div>

        <!-- Nothing installed -->
        <DmsCard v-else-if="modules.length === 0" :padded="false">
          <DmsEmptyState
            icon="i-ph-package"
            :title="t('modules.empty.title')"
            :description="t('modules.empty.description')"
          />
        </DmsCard>

        <!-- Search with no result: point to where the thing lives. -->
        <DmsCard v-else-if="visibleModules.length === 0" :padded="false">
          <DmsEmptyState
            variant="no-result"
            :title="
              trimmedQuery
                ? t('modules.no_result.title', { query: trimmedQuery })
                : t('modules.no_result.title_filtered')
            "
          >
            <template v-if="pageMatch">
              <i18n-t
                :keypath="
                  pageMatch.sectionTitle
                    ? 'modules.no_result.lives_in_section'
                    : 'modules.no_result.lives_in'
                "
                scope="global"
                tag="span"
              >
                <template #page>{{ pageMatch.pageTitle }}</template>
                <template #module>
                  <b class="text-highlighted font-semibold">
                    {{ pageMatch.moduleTitle }}
                  </b>
                </template>
                <template #section>{{ pageMatch.sectionTitle }}</template>
              </i18n-t>
              {{ " " }}
            </template>
            <i18n-t
              keypath="modules.no_result.palette"
              scope="global"
              tag="span"
            >
              <template #shortcut>
                <span class="inline-flex gap-0.5 align-middle">
                  <UKbd :value="keyLabel('meta')" size="sm" />
                  <UKbd :value="keyLabel('k')" size="sm" />
                </span>
              </template>
            </i18n-t>
            <template #actions>
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                :label="t('modules.no_result.clear')"
                @click="clearFilters"
              />
              <UButton
                v-if="pageMatch"
                :to="pageMatch.path"
                size="sm"
                icon="i-ph-arrow-right"
                :label="
                  t('modules.no_result.open_page', {
                    module: pageMatch.moduleTitle,
                    page: pageMatch.pageTitle,
                  })
                "
              />
            </template>
          </DmsEmptyState>
        </DmsCard>

        <div v-else :class="TILE_GRID_CLASS">
          <ModuleCatalogTile
            v-for="entry in visibleModules"
            :key="entry.id"
            :entry="entry"
            :to="moduleTarget(entry)"
          />
        </div>
      </section>

      <!-- Module store: a preview, nothing installs from here yet. -->
      <section class="mt-10" aria-labelledby="module-store-title">
        <DmsSectionHeader
          class="mb-3"
          :count="isInitiallyLoading ? undefined : storeModules.length"
          :description="t('modules.store.description')"
        >
          <template #title>
            <span id="module-store-title">{{ t("modules.store.title") }}</span>
          </template>
          <template #badge>
            <DmsStatusPill
              tone="info"
              :label="t('modules.store.soon')"
              size="sm"
              uppercase
            />
          </template>
        </DmsSectionHeader>

        <DmsBanner
          class="mb-4"
          tone="info"
          size="sm"
          icon="i-ph-storefront"
          :title="t('modules.store.banner.title')"
          :description="t('modules.store.banner.description')"
        />

        <!-- Which modules are installed is unknown until the listing loads:
             the store list waits for it. -->
        <DmsCard
          v-if="!isInitiallyLoading && storeModules.length === 0"
          :padded="false"
        >
          <DmsEmptyState
            icon="i-ph-check-circle"
            :title="t('modules.store.all_installed.title')"
            :description="t('modules.store.all_installed.description')"
          />
        </DmsCard>

        <template v-else-if="!isInitiallyLoading">
          <div :class="TOOLBAR_CLASS">
            <DmsSearchInput
              v-model="storeQuery"
              size="sm"
              :placeholder="t('modules.store.search_placeholder')"
              class="w-[300px] max-md:w-full"
            />
            <DmsChipGroup
              :items="storeCategoryOptions"
              :selected="[storeCategory]"
              :label="t('modules.store.category_label')"
              @pick="storeCategory = $event"
            />
          </div>

          <DmsCard v-if="visibleStoreModules.length === 0" :padded="false">
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
            />
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
