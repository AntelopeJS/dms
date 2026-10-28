<script setup lang="ts">
interface PageSkeletonProps {
  /** Draws the page title too (when the layout shows no page header). */
  withTitle?: boolean;
}

const props = defineProps<PageSkeletonProps>();

const CONTENT_LINE_WIDTHS = ["72%", "58%", "66%", "44%"];

const { t } = useI18n();
</script>

<template>
  <div aria-hidden="true" class="dms-page-skeleton space-y-6">
    <div v-if="props.withTitle" class="flex items-center gap-3.5">
      <USkeleton
        :aria-label="t('dms.a11y.loading')"
        class="size-9 rounded-[9px]"
      />
      <div class="space-y-2">
        <USkeleton :aria-label="t('dms.a11y.loading')" class="h-5 w-48" />
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          class="h-3 w-72 max-w-[60vw]"
        />
      </div>
    </div>
    <div class="dms-card space-y-4 p-[18px]">
      <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3.5 w-40" />
      <USkeleton
        :aria-label="t('dms.a11y.loading')"
        v-for="width in CONTENT_LINE_WIDTHS"
        :key="width"
        class="h-2.5"
        :style="{ width }"
      />
    </div>
  </div>
</template>
