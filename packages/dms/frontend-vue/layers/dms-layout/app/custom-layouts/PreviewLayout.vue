<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
});
</script>

<template>
  <!-- The block preview's frame: nothing around the blocks, so an embedding
       page sizes the iframe to them and a capture crops to them. -->
  <main class="bg-default" data-dms-page-content>
    <slot />
  </main>
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
