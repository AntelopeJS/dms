<script setup lang="ts">
import PreviewSidebar from "../build/components/layout/PreviewSidebar.vue";
import {
  PREVIEW_FRAME_ATTRIBUTE,
  PREVIEW_NAVIGATION_ATTRIBUTE,
  previewNavigation,
} from "#dms-ui/app/entries/composables/block-preview/previewNavigation";

/**
 * The block preview's frame: nothing around the blocks, so an embedding page
 * sizes the iframe to them and a capture crops to them. A mockup's `render`
 * adds the sidebar of its pages, drawn as the dashboard draws its own.
 */
defineOptions({
  inheritAttrs: false,
});

const { t } = useI18n();
const isSidebarOpen = ref(false);

const frameAttribute = { [PREVIEW_FRAME_ATTRIBUTE]: "" };
const navigationAttribute = { [PREVIEW_NAVIGATION_ATTRIBUTE]: "" };
</script>

<template>
  <div v-bind="frameAttribute" class="flex items-stretch">
    <PreviewSidebar
      v-if="previewNavigation"
      v-model:open="isSidebarOpen"
      :navigation="previewNavigation"
    />
    <main class="bg-default min-w-0 flex-1" data-dms-page-content>
      <div
        v-if="previewNavigation"
        v-bind="navigationAttribute"
        class="border-default flex items-center gap-2 border-b px-3 py-2 lg:hidden"
      >
        <UButton
          color="neutral"
          variant="ghost"
          class="text-muted hover:text-highlighted"
          :icon="isSidebarOpen ? 'i-ph-x' : 'i-ph-list'"
          :aria-label="
            isSidebarOpen ? t('header.close_sidebar') : t('header.open_sidebar')
          "
          @click="isSidebarOpen = !isSidebarOpen"
        />
        <span class="text-highlighted truncate text-sm font-semibold">
          {{ previewNavigation.title }}
        </span>
      </div>
      <slot />
    </main>
  </div>
</template>

<style>
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
