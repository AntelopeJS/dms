<script setup lang="ts">
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
 * backend holds. Either way it marks itself as a surface the dashboard's side
 * panel docks beside; its layout keeps the room for that panel.
 */

const route = useDmsRoute();

const name = readQueryValue(route.query.name);
const width = readQueryValue(route.query.width);
const data = readQueryValue(route.query.data);
</script>

<template>
  <div data-dms-docks-side-panel>
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
