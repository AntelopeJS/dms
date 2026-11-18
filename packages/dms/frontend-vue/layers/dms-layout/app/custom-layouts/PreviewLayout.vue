<script setup lang="ts">
import DashboardSidebar from "../build/components/layout/DashboardSidebar.vue";
import PreviewTopBar from "../build/components/layout/PreviewTopBar.vue";
import {
  PREVIEW_FRAME_ATTRIBUTE,
  previewHeader,
  previewNavigation,
} from "#dms-ui/app/entries/composables/block-preview/previewNavigation";

/**
 * The block preview's frame: nothing around the blocks, so an embedding page
 * sizes the iframe to them and a capture crops to them. A mockup's `render`
 * adds the dashboard's own sidebar, listing its pages, and the top bar over
 * the page. The frame grows with its content, and keeps the sidebar's size
 * to itself, never in the dashboard's storage. A mockup's sidebar stays
 * folded to its rail whatever the dashboard's starts as.
 */
defineOptions({
  inheritAttrs: false,
});

const FRAME_CLASS = "static inset-auto items-stretch overflow-visible";

const frameAttribute = { [PREVIEW_FRAME_ATTRIBUTE]: "" };
</script>

<template>
  <UDashboardGroup
    v-bind="frameAttribute"
    :persistent="false"
    unit="px"
    :class="FRAME_CLASS"
  >
    <DashboardSidebar
      v-if="previewNavigation"
      :navigation="previewNavigation"
    />
    <main class="bg-default min-w-0 flex-1" data-dms-page-content>
      <PreviewTopBar
        v-if="previewNavigation"
        :title="previewHeader?.title ?? previewNavigation.title ?? ''"
      />
      <slot />
    </main>
  </UDashboardGroup>
</template>

<style>
[data-dms-preview-frame] {
  min-height: var(--dms-preview-min-height, 0px);
}

/* A transparent preview (`transparent: true`) lets the embedding page's own
   background show through the iframe, e.g. a docs site in dark mode. */
html:has([data-dms-preview-transparent]),
html:has([data-dms-preview-transparent]) body,
html:has([data-dms-preview-transparent]) [data-dms-page-content] {
  background: transparent;
}

/* A browser paints an opaque backdrop behind an iframe whose color scheme
   differs from the embedding page's: declare the theme's own scheme, so a dark
   docs page (`color-scheme: dark`) shows through a dark preview. */
html.dark:has([data-dms-preview-transparent]) {
  color-scheme: dark;
}

html.light:has([data-dms-preview-transparent]) {
  color-scheme: light;
}
</style>
