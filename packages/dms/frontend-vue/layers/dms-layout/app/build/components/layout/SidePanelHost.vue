<script setup lang="ts">
/**
 * Renders the open side panel (see `useSidePanel`) once for the whole app,
 * registered as an app overlay: outside the routed layouts, so moving between
 * the default and settings layouts keeps the panel's component mounted. The
 * server renders it from the side panel cookie, in place on the first paint.
 * Keyed by panel id, so each panel keeps its own focus bookkeeping.
 */
import DashboardSidePanel from "./DashboardSidePanel.vue";
import { useActiveSidePanel } from "../../composables/layout/sidePanelState";

const { panel } = useActiveSidePanel();
</script>

<template>
  <DashboardSidePanel v-if="panel" :key="panel.id" :panel="panel" />
</template>
