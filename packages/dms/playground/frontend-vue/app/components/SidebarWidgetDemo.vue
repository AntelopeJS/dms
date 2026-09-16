<script setup lang="ts">
/**
 * Demo sidebar widget (see `useSidebarWidgets`). The DMS mounts it as-is in
 * the sidebar between the logo and the search button — its registered
 * `ABOVE_SEARCH_BAR` position — and only outside modules, since it has no
 * `module` scope. It also receives the sidebar's `collapsed` state, which this
 * card uses to shrink to an icon-only chip in the narrow rail.
 */
defineProps<{
  collapsed?: boolean;
}>();

const HMR_PROBE_VALUE = "baseline";
</script>

<template>
  <div
    :data-dms-hmr-probe="HMR_PROBE_VALUE"
    class="border-default bg-elevated flex items-center gap-2.5 rounded-md border px-3 py-2"
    :class="{ 'justify-center px-0': collapsed }"
  >
    <UIcon name="i-ph-megaphone" class="text-primary size-4 shrink-0" />
    <div v-if="!collapsed" class="min-w-0">
      <p class="text-highlighted truncate text-xs font-medium">
        {{ $t("demo.widgets.sidebar.title") }}
      </p>
      <p class="text-muted truncate text-xs">
        {{ $t("demo.widgets.sidebar.description") }}
      </p>
    </div>
  </div>
</template>
