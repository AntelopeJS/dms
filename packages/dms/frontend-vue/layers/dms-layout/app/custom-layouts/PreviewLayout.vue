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
</style>
