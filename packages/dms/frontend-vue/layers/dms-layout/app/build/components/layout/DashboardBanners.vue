<script setup lang="ts">
/**
 * Stacks the global layout banners under the dashboard header, on every page
 * of the dashboard layout. Each banner carries its own live-region role, so a
 * banner appearing after a navigation is announced as well.
 */
const { banners, dismiss } = useLayoutBanners();
const { processI18n } = useTranslation();

const entries = computed(() =>
  banners.value.map((banner) => ({
    banner,
    presentation: resolveLayoutBannerPresentation(banner),
  })),
);
</script>

<template>
  <div
    v-if="entries.length"
    data-dms-layout-banners
    class="border-default flex flex-col border-b"
  >
    <div
      v-for="{ banner, presentation } in entries"
      :key="banner.key"
      :role="presentation.role"
      :data-dms-layout-banner="banner.key"
    >
      <UAlert
        variant="subtle"
        orientation="horizontal"
        :color="presentation.color"
        :icon="presentation.icon"
        :close="banner.dismissible"
        class="rounded-none px-4 py-2.5 sm:px-6"
        @update:open="dismiss(banner.key)"
      >
        <template #description>
          <component
            :is="banner.component"
            v-if="banner.component"
            v-bind="banner.props"
          />
          <template v-else>{{ processI18n(banner.text ?? "") }}</template>
        </template>
      </UAlert>
    </div>
  </div>
</template>
