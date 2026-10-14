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
