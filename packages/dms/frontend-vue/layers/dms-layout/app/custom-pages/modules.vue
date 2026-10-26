<script setup lang="ts">
import { MONO_CHIP_CLASS } from "#dms-ui/app/entries/utils/monoChip";
import UButton from "@nuxt/ui/components/Button.vue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import DmsEmptyState from "#dms-ui/app/components/empty-state/EmptyState.vue";
import DmsSectionHeader from "#dms-ui/app/components/section-header/SectionHeader.vue";
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import DmsStatGroup, {
  type StatGroupItem,
} from "#dms-ui/app/components/stat-group/StatGroup.vue";
import type { Tone } from "#dms-core/app/types/tone";
import { useKeyboardPlatform } from "#dms-ui/app/composables/global/keyboardPlatform";
import DmsChipGroup from "#dms-ui/app/entries/components/form/ChipGroup";
import ModuleCatalogTile from "../build/components/pages/modules/ModuleCatalogTile.vue";
import ModuleStoreBanners from "../build/components/pages/modules/ModuleStoreBanners.vue";
import ModuleTileSkeleton from "../build/components/pages/modules/ModuleTileSkeleton.vue";
import { usePageHeaderActions } from "#dms-ui/app/composables/layout/usePageHeaderActions";
import {
  ENDPOINT_MODULES_LISTING,
  useModulesListing,
} from "../composables/page/useModulesListing";
import { useModuleHistory } from "../composables/page/useModuleHistory";
import type { ModuleCatalogEntry } from "#dms-core/app/types/page";
import {
  MODULE_CATEGORY_ALL,
  MODULE_STORE_PATH,
  MODULE_TILE_GRID_CLASS,
  filterModules,
  parseModuleSortMode,
  findModulePageMatch,
  moduleCategoryOptions,
  sortModules,
  summarizeModules,
  type ModuleSortMode,
} from "../build/utils/modules-catalog";
import {
  sortStoreModules,
  storeOnlyModules,
  storeOpenTarget,
  toModuleStoreEntry,
  withStoreDetails,
} from "../build/utils/module-store-catalog";
import { useModuleStore } from "../composables/page/useModuleStore";
import { useModuleStoreActions } from "../composables/page/useModuleStoreActions";
import DmsSearchInput from "#dms-ui/app/entries/components/form/SearchInput";

const SKELETON_PLACEHOLDER_COUNT = 6;

const { t, locale } = useI18n();
const { processI18n } = useTranslation();
const { keyLabel } = useKeyboardPlatform();
const isOwner = useIsOwner();
const homepage = useHomepage();
const siteLayout = useSiteLayout();
const modulesListing = useModulesListing();
const moduleHistory = useModuleHistory();

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
      label: t("modules.browse_store"),
      icon: "i-ph-storefront",
      to: MODULE_STORE_PATH,
      color: "primary",
      variant: "soft",
      ui: { label: "max-sm:sr-only" },
      "aria-label": t("modules.browse_store"),
    }),
    h(UButton, {
      label: t("modules.refresh"),
      icon: "i-ph-arrows-clockwise",
      color: "neutral",
      variant: "outline",

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

if (!isOwner.value) {
  throw showDmsError({
    statusCode: HTTP_FORBIDDEN,
    statusMessage: "Access denied",
  });
}

const moduleStore = useModuleStore();

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

const storeModules = computed(() =>
  sortStoreModules(
    (moduleStore.listing.value?.modules ?? []).map((entry) =>
      toModuleStoreEntry(entry, modulesListing.modules.value ?? []),
    ),
    processI18n,
    locale.value,
  ),
);
const storeEntries = computed(
  () => new Map(storeModules.value.map((entry) => [entry.id, entry])),
);

const modules = computed<ModuleCatalogEntry[]>(() => {
  const registered = withStoreDetails(
    (modulesListing.modules.value ?? []).filter((entry) => entry.hasAccess),
    storeModules.value,
  );
  return [...registered, ...storeOnlyModules(storeModules.value, registered)];
});
const summary = computed(() => summarizeModules(modules.value));

const visitedAt = computed(
  () =>
    new Map(
      moduleHistory.entries.value.map((visit) => [
        visit.moduleId,
        visit.visitedAt,
      ]),
    ),
);

const TOOLBAR_CLASS = "mb-[18px] flex flex-wrap items-center gap-2.5";

const query = ref("");
const category = ref<string>(MODULE_CATEGORY_ALL);

const SORT_MODE_PREFERENCE_KEY = "modulesPage.sort";
const { getPreference, setPreference } = usePreferences();
const sortMode = computed<ModuleSortMode>({
  get: () => parseModuleSortMode(getPreference(SORT_MODE_PREFERENCE_KEY)),
  set: (mode) => setPreference(SORT_MODE_PREFERENCE_KEY, mode),
});

const categoryOptions = computed(() => [
  {
    value: MODULE_CATEGORY_ALL,
    label: t("modules.category.all"),
    count: modules.value.length,
  },
  ...moduleCategoryOptions(modules.value, processI18n),
]);

watch(categoryOptions, (options) => {
  if (!options.some((option) => option.value === category.value)) {
    category.value = MODULE_CATEGORY_ALL;
  }
});

const sortItems = computed(() => [
  { value: "name", label: t("modules.sort.name") },
  { value: "recent", label: t("modules.sort.recent") },
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
    locale.value,
  ),
);

const trimmedQuery = computed(() => query.value.trim());

const pageMatch = computed(() => {
  if (visibleModules.value.length > 0 || !trimmedQuery.value) return null;
  const match = findModulePageMatch(
    siteLayout.siteLayout.value,
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

onMounted(() => {
  if (isOwner.value) moduleStore.start();
});
onBeforeUnmount(() => moduleStore.stop());

const storeListing = computed(() => moduleStore.listing.value);
const { runStoreAction, frontendNotice } = useModuleStoreActions(
  moduleStore,
  storeModules,
);

/** Whether a tile's store actions wait: read-only, or another one runs. */
function isTileLocked(moduleId: string): boolean {
  const listing = storeListing.value;
  if (!listing?.enabled) return true;
  return listing.busy && storeEntries.value.get(moduleId)?.state !== "busy";
}

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

      <ModuleStoreBanners
        :listing="storeListing"
        :frontend-notice="frontendNotice"
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
          :class="MODULE_TILE_GRID_CLASS"
          aria-busy="true"
        >
          <ModuleTileSkeleton
            v-for="placeholder in skeletonItems"
            :key="placeholder"
          />
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

        <div v-else :class="MODULE_TILE_GRID_CLASS">
          <ModuleCatalogTile
            v-for="entry in visibleModules"
            :key="entry.id"
            :entry="entry"
            :to="storeOpenTarget(entry, modules)"
            :store-entry="storeEntries.get(entry.id)"
            :is-locked="isTileLocked(entry.id)"
            @action="
              (kind) => {
                const storeEntry = storeEntries.get(entry.id);
                if (storeEntry) void runStoreAction(kind, storeEntry);
              }
            "
          />
        </div>
      </section>
    </template>
  </div>
</template>
