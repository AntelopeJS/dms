<script setup lang="ts">
import DashboardSidePanel from "./DashboardSidePanel.vue";
import { useActiveSidePanel } from "#dms-ui/app/entries/composables/layout/sidePanelState";

/**
 * The open side panel, rendered once for the whole app as an app overlay, outside
 * the routed layouts: moving between the default and settings layouts keeps the
 * panel's component mounted. The server renders it from the side panel cookie, in
 * place on the first paint.
 */
const { panel } = useActiveSidePanel();
</script>

<template>
  <DashboardSidePanel v-if="panel" :key="panel.id" :panel="panel" />
</template>
