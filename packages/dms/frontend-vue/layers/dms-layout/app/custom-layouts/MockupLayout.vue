<script setup lang="ts">
import DashboardSidebar from "../build/components/layout/DashboardSidebar.vue";
import { useSidePanelRoom } from "#dms-ui/app/entries/composables/layout/sidePanelState";

/**
 * The frame of the `/mockup` viewer: the dashboard's own sidebar, fixed to its
 * icon rail so settings and the rest stay one click away, and the viewer
 * across the rest of the window. The rail cannot be unfolded and never reads
 * or writes the dashboard's own collapsed state or sizes. Like a dashboard
 * frame, the group stops short of the docked side panel and the assistant's
 * folded bar, so neither is drawn under it.
 */
defineOptions({
  inheritAttrs: false,
});

const SIDE_PANEL_ROOM_CLASS =
  "end-[var(--dms-side-rail-width,0px)] lg:end-[calc(min(var(--dms-side-panel-width,0px),60vw)+var(--dms-side-rail-width,0px))]";

const groupAttrs = useSidePanelRoom(SIDE_PANEL_ROOM_CLASS);
</script>

<template>
  <UDashboardGroup
    data-dms-docks-side-panel
    :persistent="false"
    unit="px"
    v-bind="groupAttrs"
  >
    <DashboardSidebar locked-collapsed />
    <main class="bg-default min-w-0 flex-1" data-dms-page-content>
      <slot />
    </main>
  </UDashboardGroup>
</template>
