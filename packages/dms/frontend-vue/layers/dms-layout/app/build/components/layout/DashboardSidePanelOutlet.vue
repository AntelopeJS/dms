<script setup lang="ts">
/**
 * Shows the active side panel (the open one opened last, see
 * `useAppSidePanels`) after the page panel of the dashboard group. Keyed by
 * panel id, so each panel keeps its own width and focus bookkeeping.
 */
import DashboardSidePanel from "./DashboardSidePanel.vue";
import { useActiveSidePanel } from "./sidePanelStack";

const activePanel = useActiveSidePanel();

// Panels are registered on the client only. The server, and the client until
// it has mounted, render nothing here, so hydration finds the same markup.
const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});
</script>

<template>
  <DashboardSidePanel
    v-if="isMounted && activePanel"
    :key="activePanel.id"
    :panel="activePanel"
  />
</template>
