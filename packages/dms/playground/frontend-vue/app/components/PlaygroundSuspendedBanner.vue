<script setup lang="ts">
/**
 * Content of the playground's component layout banner. The DMS draws the
 * banner around it (color, icon, ARIA role); this component only renders the
 * message and the link its `props` name.
 */
defineProps<{
  to: string;
}>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    <span>{{ $t("demo.pages.banners.suspended") }}</span>
    <ULink :to="to" class="font-medium underline">
      {{ $t("demo.pages.banners.suspended_link") }}
    </ULink>
  </div>
</template>
