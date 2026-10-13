<script setup lang="ts">
/**
 * A free app overlay (see `useAppOverlay`): the DMS renders it as is on every
 * page, outside the routed page, and it places itself. This one floats in
 * the bottom-right corner, opens the demo side panel, and removes itself.
 */
import { useSidePanelDemo } from "../../composables/useSidePanelDemo";

const OVERLAY_NAME = "PlaygroundOverlayBubble";

const panel = useSidePanelDemo();
const { unregister } = useAppOverlay();
</script>

<template>
  <div
    class="border-default bg-elevated fixed end-6 bottom-6 z-40 flex items-center gap-1 rounded-full border p-1 shadow-lg"
  >
    <UButton
      icon="i-ph-sidebar-simple"
      :label="$t('demo.frontend.overlay.open_panel')"
      size="sm"
      class="rounded-full"
      @click="panel.toggle"
    />
    <UButton
      icon="i-ph-x"
      color="neutral"
      variant="ghost"
      size="sm"
      class="rounded-full"
      :aria-label="$t('demo.frontend.overlay.remove')"
      @click="unregister(OVERLAY_NAME)"
    />
  </div>
</template>
