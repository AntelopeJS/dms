<script setup lang="ts">
import MockupIndex from "../../build/components/block-preview/MockupIndex.vue";
import MockupWorkbench from "../../build/components/block-preview/MockupWorkbench.vue";
import {
  isMockupDataMode,
  isMockupWidth,
  readQueryValue,
} from "../../build/utils/mockup";

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
