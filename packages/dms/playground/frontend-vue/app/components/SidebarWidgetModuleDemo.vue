<script setup lang="ts">
/**
 * Demo of a module-scoped sidebar widget (see `SidebarWidget.module`).
 * Registered with `module: "demo"`, so the DMS only mounts it while browsing
 * inside the demo module (`/modules/demo/**`) and hides it everywhere else —
 * including inside other modules like `plain`. Its `BELOW_SEARCH_BAR` position
 * lands it under the module title card, independently of that scoping.
 */
defineProps<{
  collapsed?: boolean;
}>();
</script>

<template>
  <div
    class="border-primary/25 bg-primary/5 flex items-center gap-2.5 rounded-md border px-3 py-2"
    :class="{ 'justify-center px-0': collapsed }"
  >
    <UIcon name="i-ph-cube" class="text-primary size-4 shrink-0" />
    <div v-if="!collapsed" class="min-w-0">
      <p class="text-highlighted truncate text-xs font-medium">
        {{ $t("demo.widgets.moduleSidebar.title") }}
      </p>
      <p class="text-muted truncate text-xs">
        {{ $t("demo.widgets.moduleSidebar.description") }}
      </p>
    </div>
  </div>
</template>
