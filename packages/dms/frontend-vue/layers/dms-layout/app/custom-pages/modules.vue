<script setup lang="ts">
import type { Ref, VNode } from "vue";
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
import ModuleStoreDependencyPicker from "../build/components/pages/modules/ModuleStoreDependencyPicker.vue";
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
  type ModuleStoreEntry,
  type StoreScope,
  FRONTEND_BUILD_COMMAND,
  filterByScope,
  isAwaitingFrontend,
  needsDependencyChoice,
  sortStoreModules,
  toModuleStoreEntry,
} from "../build/utils/module-store-catalog";
import {
  type DependencyDraft,
  areDependencyDraftsValid,
  buildInstallBody,
  createDependencyDrafts,
} from "../build/utils/module-store-install";
import { useModuleStore } from "../composables/page/useModuleStore";
import {
  ConfirmActionError,
  useConfirm,
} from "#dms-ui/app/composables/confirm";
import type {
  StoreActionBody,
  StoreOperationKind,
} from "../types/module-store";
import DmsSearchInput from "#dms-ui/app/build/components/form/SearchInput.vue";

const SKELETON_PLACEHOLDER_COUNT = 6;

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
  throw showDmsError({
    statusCode: HTTP_FORBIDDEN,
    statusMessage: "Access denied",
  });
}

// Read with the page, which the server renders and hands over: the
// hydration reuses the listing the server rendered (read again, its live
// readouts, an uptime a minute on, would no longer match the markup).
await modulesListing.loadModulesListing();

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

// ── Module store ───────────────────────────────────────────────────
const moduleStore = useModuleStore();
const toast = useToast();
const { confirm } = useConfirm();

onMounted(() => {
  if (isOwner.value) void moduleStore.load();
});
onBeforeUnmount(() => moduleStore.stop());

const storeListing = computed(() => moduleStore.listing.value);
const isStoreLoading = computed(
  () => storeListing.value === undefined && !moduleStore.loadingError.value,
);
const storeModules = computed(() =>
  sortStoreModules(
    (storeListing.value?.modules ?? []).map((entry) =>
      toModuleStoreEntry(entry, modulesListing.modules.value ?? []),
    ),
    processI18n,
  ),
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

/** Store modules whose interface the running frontend does not match yet. */
const frontendLagging = computed(() =>
  storeModules.value.filter(
    (entry) =>
      isAwaitingFrontend(entry) ||
      (entry.frontend === "unknown" &&
        moduleStore.awaitingReload.value.has(entry.id)),
  ),
);
const frontendNotice = computed(() => {
  const lagging = frontendLagging.value;
  if (lagging.length === 0) return null;
  const names = lagging.map((entry) => processI18n(entry.title)).join(", ");
  const hasReported = lagging.every((entry) => entry.frontend !== "unknown");
  const key = !hasReported
    ? "unknown"
    : storeListing.value?.dev
      ? "dev"
      : "production";
  return { key, names };
});

/**
 * Runs `kind` from a dialog: a refusal is worded as the toast words it and
 * shown in the dialog, which stays open.
 */
async function runFromDialog(
  kind: StoreOperationKind,
  entry: ModuleStoreEntry,
  body?: StoreActionBody,
): Promise<void> {
  try {
    await moduleStore.run(kind, entry, body);
  } catch (error) {
    throw new ConfirmActionError({
      title: t("modules.store.action_failed", {
        module: processI18n(entry.title),
      }),
      description: resolveStoreError(error),
    });
  }
}

/** What the owner last picked in a module's install dialog, for a retry. */
const lastDependencyDrafts = new Map<string, DependencyDraft[]>();

function renderDependencyPicker(
  entry: ModuleStoreEntry,
  drafts: Ref<DependencyDraft[]>,
  showErrors: boolean,
): VNode {
  return h(ModuleStoreDependencyPicker, {
    missing: entry.missingInterfaces,
    drafts: drafts.value,
    showErrors,
    onUpdate: (index: number, patch: Partial<DependencyDraft>) => {
      drafts.value = drafts.value.map((draft, position) =>
        position === index ? { ...draft, ...patch } : draft,
      );
    },
  });
}

/**
 * Asks which modules implement the interfaces the release misses, then
 * installs them with it. A refusal shows in the dialog, kept open.
 */
async function installWithDependencies(entry: ModuleStoreEntry): Promise<void> {
  const title = processI18n(entry.title);
  const drafts = ref(
    createDependencyDrafts(
      entry.missingInterfaces,
      lastDependencyDrafts.get(entry.id),
    ),
  );
  const showErrors = ref(false);
  await confirm({
    title: t("modules.store.install_dialog.title", { module: title }),
    description: t("modules.store.install_dialog.description", {
      module: title,
    }),
    confirmLabel: t("modules.store.actions.install"),
    confirmIcon: "i-ph-download-simple",
    icon: "i-ph-puzzle-piece",
    body: () => renderDependencyPicker(entry, drafts, showErrors.value),
    validate: () => {
      showErrors.value = true;
      return areDependencyDraftsValid(drafts.value);
    },
    onConfirm: async () => {
      lastDependencyDrafts.set(entry.id, drafts.value);
      await runFromDialog(
        "install",
        entry,
        buildInstallBody(entry.id, drafts.value),
      );
    },
  });
}

async function runStoreAction(
  kind: StoreOperationKind,
  entry: ModuleStoreEntry,
): Promise<void> {
  const title = processI18n(entry.title);
  if (needsDependencyChoice(entry, kind)) {
    await installWithDependencies(entry);
    return;
  }
  if (kind === "uninstall") {
    await confirm({
      title: t("modules.store.uninstall_confirm.title", { module: title }),
      description: t("modules.store.uninstall_confirm.description", {
        module: title,
      }),
      confirmLabel: t("modules.store.actions.uninstall"),
      color: "error",
      icon: "i-ph-trash",
      onConfirm: () => runFromDialog(kind, entry),
    });
    return;
  }
  try {
    await moduleStore.run(kind, entry);
  } catch (error) {
    toast.add({
      color: "error",
      icon: "i-ph-warning-circle",
      title: t("modules.store.action_failed", { module: title }),
      description: resolveStoreError(error),
    });
  }
}

/** What a refused store request carries: the server's error key, if any. */
interface StoreRequestError {
  data?: unknown;
  message?: string;
}

function resolveStoreError(error: unknown): string {
  const details = error as StoreRequestError | undefined;
  const key = typeof details?.data === "string" ? details.data : undefined;
  if (!key) return details?.message ?? "";
  return t(`modules.store.errors.${key.replace("error.", "")}`);
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
              <USkeleton
                :aria-label="t('dms.a11y.loading')"
                class="size-9 rounded-[10px]"
              />
              <USkeleton
                :aria-label="t('dms.a11y.loading')"
                class="h-5 w-12 rounded-full"
              />
            </div>
            <USkeleton
              :aria-label="t('dms.a11y.loading')"
              class="h-2.5 w-4/5"
            />
            <USkeleton
              :aria-label="t('dms.a11y.loading')"
              class="h-2.5 w-3/5"
            />
            <USkeleton
              :aria-label="t('dms.a11y.loading')"
              class="mt-auto h-4 w-2/5"
            />
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

      <!-- Module store: the official modules, installed or not. -->
      <section class="mt-10" aria-labelledby="module-store-title">
        <DmsSectionHeader
          class="mb-3"
          :count="isStoreLoading ? undefined : storeModules.length"
          :description="t('modules.store.description')"
        >
          <template #title>
            <span id="module-store-title">{{ t("modules.store.title") }}</span>
          </template>
          <template #trailing>
            <span
              v-if="storeListing?.frontendVersion"
              :class="[
                MONO_CHIP_CLASS,
                'text-dimmed border border-(--ui-border) text-[11px] max-sm:hidden',
              ]"
              :title="
                storeListing.frontendVersionSource
                  ? t(
                      `modules.store.frontend_version.${storeListing.frontendVersionSource}`,
                    )
                  : undefined
              "
            >
              {{
                t("modules.store.frontend_version.label", {
                  version: storeListing.frontendVersion,
                })
              }}
            </span>
            <DmsSegmented
              v-model="storeScope"
              :items="storeScopeItems"
              size="sm"
              :aria-label="t('modules.store.scope.label')"
            />
          </template>
        </DmsSectionHeader>

        <DmsBanner
          v-if="storeListing?.configError"
          class="mb-4"
          tone="error"
          size="sm"
          icon="i-ph-file-x"
          :title="t('modules.store.config_error')"
          :description="storeListing.configError"
        />
        <DmsBanner
          v-else-if="storeListing && !storeListing.enabled"
          class="mb-4"
          tone="info"
          size="sm"
          icon="i-ph-lock-simple"
          :title="t('modules.store.disabled.title')"
          :description="t('modules.store.disabled.description')"
        />

        <!-- The interface lags behind the backend: say what follows. -->
        <DmsBanner
          v-if="frontendNotice"
          class="mb-4"
          :tone="frontendNotice.key === 'dev' ? 'info' : 'warning'"
          size="sm"
          :icon="
            frontendNotice.key === 'dev'
              ? 'i-ph-circle-notch'
              : 'i-ph-arrows-clockwise'
          "
          :title="
            t(`modules.store.frontend.${frontendNotice.key}.title`, {
              modules: frontendNotice.names,
            })
          "
        >
          <template #description>
            <i18n-t
              :keypath="`modules.store.frontend.${frontendNotice.key}.description`"
              scope="global"
              tag="span"
            >
              <template #command>
                <code
                  :class="[
                    MONO_CHIP_CLASS,
                    'bg-elevated text-highlighted text-xs',
                  ]"
                >
                  {{ FRONTEND_BUILD_COMMAND }}
                </code>
              </template>
            </i18n-t>
          </template>
        </DmsBanner>

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
              :is-locked="
                !storeListing?.enabled ||
                (storeListing?.busy === true && entry.state !== 'busy')
              "
              @action="runStoreAction($event, entry)"
            />
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
