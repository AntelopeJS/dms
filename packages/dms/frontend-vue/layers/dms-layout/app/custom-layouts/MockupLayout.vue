<script setup lang="ts">
import DashboardSidebar from "../build/components/layout/DashboardSidebar.vue";

/**
 * The frame of the `/mockup` viewer: the dashboard's own sidebar, fixed to its
 * icon rail so settings and the rest stay one click away, and the viewer
 * across the rest of the window. The rail cannot be unfolded and never reads
 * or writes the dashboard's own collapsed state or sizes.
 */
defineOptions({
  inheritAttrs: false,
});
</script>

<template>
  <UDashboardGroup :persistent="false" unit="px">
    <DashboardSidebar locked-collapsed />
    <main class="bg-default min-w-0 flex-1" data-dms-page-content>
      <slot />
    </main>
  </UDashboardGroup>
</template>
