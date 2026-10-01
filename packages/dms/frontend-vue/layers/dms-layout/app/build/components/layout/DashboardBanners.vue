<script setup lang="ts">
/**
 * Stacks the global layout banners under the dashboard header, on every page
 * of the dashboard layout. Each banner carries its own live-region role, so a
 * banner appearing after a navigation is announced as well.
 */
const { banners, dismiss } = useLayoutBanners();
const { processI18n } = useTranslation();

// Rows read as tinted bands (design .banner strip): no ring, the colour kept
// for the icon and the hairline between stacked rows.
const ROW_SEPARATOR: Record<LayoutBannerVariant, string> = {
  info: "border-info/40",
  warning: "border-warning/40",
  error: "border-error/40",
};

const ALERT_UI = {
  description: "text-toned text-[13px]",
  icon: "size-4",
};

const CLOSE_BUTTON = {
  size: "xs",
  color: "neutral",
  variant: "ghost",
} as const;

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
      v-for="({ banner, presentation }, index) in entries"
      :key="banner.key"
      :role="presentation.role"
      :data-dms-layout-banner="banner.key"
      :class="index > 0 && ['border-t', ROW_SEPARATOR[presentation.color]]"
    >
      <UAlert
        variant="subtle"
        orientation="horizontal"
        :color="presentation.color"
        :icon="presentation.icon"
        :close="banner.dismissible ? CLOSE_BUTTON : false"
        :ui="ALERT_UI"
        class="min-h-10 rounded-none px-4 py-1.5 ring-0 sm:px-6"
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
