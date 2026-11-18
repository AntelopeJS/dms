<script setup lang="ts">
import { useSidePanelRoom } from "../../build/composables/layout/sidePanelState";
import MockupIndex from "../../build/components/block-preview/MockupIndex.vue";
import MockupWorkbench from "../../build/components/block-preview/MockupWorkbench.vue";
import {
  isMockupDataMode,
  isMockupWidth,
  readQueryValue,
} from "../../build/utils/mockup";

/**
 * The dev-only `/mockup` page. `?name=` picks a mockup, which it draws live
 * on its Overview, or on the page `?page=` names, with `?width=desktop|mobile`
 * and `?data=real|sample` choosing the frame width and whether a converted
 * page reads its live routes; without a name it lists the mockups the
 * backend holds. Either way
 * the page keeps room on its right for the dashboard's side panel, and for
 * the assistant's folded bar, as a dashboard frame does, so neither covers the
 * mockup.
 */
const SIDE_PANEL_ROOM_CLASS =
  "pe-[var(--dms-side-rail-width,0px)] lg:pe-[calc(min(var(--dms-side-panel-width,0px),60vw)+var(--dms-side-rail-width,0px))]";

const route = useDmsRoute();

const name = readQueryValue(route.query.name);
const width = readQueryValue(route.query.width);
const data = readQueryValue(route.query.data);

const roomAttrs = useSidePanelRoom(SIDE_PANEL_ROOM_CLASS);
</script>

<template>
  <div data-dms-docks-side-panel v-bind="roomAttrs">
    <MockupWorkbench
      v-if="name"
      :name="name"
      :initial-width="isMockupWidth(width) ? width : undefined"
      :initial-data="isMockupDataMode(data) ? data : undefined"
    />
    <div v-else class="p-4 sm:p-6">
      <MockupIndex :base-path="route.path" />
    </div>
  </div>
</template>
