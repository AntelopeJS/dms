<script setup lang="ts">
// Neutral stand-in for a page whose chunk is still loading after a client
// navigation: one content card, so the switch to the page's own skeletons
// changes little. It only fades in once the wait passes the delay set by
// `.dms-page-skeleton` (main.css): a fast navigation shows nothing at all.
interface PageSkeletonProps {
  /** Draws the page title too (when the layout shows no page header). */
  withTitle?: boolean;
}

const props = defineProps<PageSkeletonProps>();

const CONTENT_LINE_WIDTHS = ["72%", "58%", "66%", "44%"];
</script>

<template>
  <div aria-hidden="true" class="dms-page-skeleton space-y-6">
    <div v-if="props.withTitle" class="flex items-center gap-3.5">
      <USkeleton class="size-9 rounded-[9px] bg-(--dms-skeleton)" />
      <div class="space-y-2">
        <USkeleton class="h-5 w-48 bg-(--dms-skeleton)" />
        <USkeleton class="h-3 w-72 max-w-[60vw] bg-(--dms-skeleton)" />
      </div>
    </div>
    <div class="dms-card space-y-4 p-[18px]">
      <USkeleton class="h-3.5 w-40 bg-(--dms-skeleton)" />
      <USkeleton
        v-for="width in CONTENT_LINE_WIDTHS"
        :key="width"
        class="h-2.5 bg-(--dms-skeleton)"
        :style="{ width }"
      />
    </div>
  </div>
</template>
