<script setup lang="ts">
const SKELETON_PLACEHOLDER_COUNT = 6;

const isOwner = useIsOwner();
const homepage = useHomepage();
const siteLayout = useSiteLayout();
const modulesListing = useModulesListing();
const moduleHistory = useModuleHistory();
const { processI18n } = useTranslation();

if (!siteLayout.siteLayout.value) {
  await siteLayout.loadSiteLayout();
}

if (!isOwner.value) {
  await navigateDms(homepage, { replace: true });
}

if (modulesListing.modules.value === undefined) {
  await modulesListing.loadModulesListing();
}

const accessibleModules = computed(() =>
  (modulesListing.modules.value ?? []).filter(
    (entry) => entry.hasAccess === true,
  ),
);

const skeletonItems = computed(() =>
  Array.from({ length: SKELETON_PLACEHOLDER_COUNT }, (_, index) => index),
);

const isInitiallyLoading = computed(
  () =>
    modulesListing.isLoading.value &&
    modulesListing.modules.value === undefined,
);

async function handleSelectModule(
  entry: ModuleInfo & { hasAccess: boolean; landingSlug: string },
): Promise<void> {
  const lastSlug = moduleHistory.getLast(entry.id);
  const target = lastSlug ?? entry.landingSlug;
  await navigateDms(target);
}
</script>

<template>
  <div class="space-y-6 pb-20">
    <div v-if="modulesListing.loadingError.value" class="text-error">
      {{ modulesListing.loadingError.value }}
    </div>

    <div
      v-else-if="isInitiallyLoading"
      class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div
        v-for="placeholder in skeletonItems"
        :key="placeholder"
        class="dms-card flex flex-col gap-4 p-6"
      >
        <USkeleton class="size-14 rounded-xl" />
        <div class="space-y-2">
          <USkeleton class="h-5 w-1/2" />
          <USkeleton class="h-3 w-full" />
          <USkeleton class="h-3 w-2/3" />
        </div>
      </div>
    </div>

    <div
      v-else-if="accessibleModules.length === 0"
      class="text-dimmed py-12 text-center"
    >
      {{ $t("modules.empty") }}
    </div>

    <div v-else class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="entry in accessibleModules"
        :key="entry.id"
        type="button"
        class="group dms-card hover:border-primary hover:ring-primary/30 hover:bg-elevated/50 focus-visible:ring-primary relative flex cursor-pointer flex-col gap-4 overflow-hidden p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
        @click="handleSelectModule(entry)"
      >
        <div
          class="from-primary/15 to-primary/5 ring-primary/20 flex size-14 items-center justify-center rounded-xl bg-gradient-to-br ring-1"
        >
          <UIcon :name="entry.icon" class="text-primary size-7" />
        </div>

        <div class="min-w-0 flex-1 space-y-1">
          <h3 class="text-highlighted text-base leading-tight font-semibold">
            {{ processI18n(entry.title) }}
          </h3>
          <p class="text-dimmed line-clamp-2 text-sm leading-relaxed">
            {{ processI18n(entry.description) }}
          </p>
        </div>

        <div
          class="text-muted group-hover:text-primary mt-1 flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <span>{{ $t("modules.open") }}</span>
          <UIcon
            name="i-ph-arrow-right"
            class="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </button>
    </div>
  </div>
</template>
