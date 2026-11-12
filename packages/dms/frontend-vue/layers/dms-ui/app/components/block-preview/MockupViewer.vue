<script setup lang="ts">
import MockupIndex from "../../build/components/block-preview/MockupIndex.vue";
import MockupWorkbench from "../../build/components/block-preview/MockupWorkbench.vue";
import {
  isMockupMode,
  isMockupWidth,
  readQueryValue,
} from "../../build/utils/mockup";

/**
 * The dev-only `/mockup` page. `?name=` picks a mockup, which it draws live
 * with `?page=`, `?width=desktop|mobile` and `?mode=edit|comment` choosing
 * the page, the frame width and the mode; without a name it lists the
 * mockups the backend holds.
 */
const route = useDmsRoute();

const name = readQueryValue(route.query.name);
const width = readQueryValue(route.query.width);
const mode = readQueryValue(route.query.mode);
</script>

<template>
  <MockupWorkbench
    v-if="name"
    :name="name"
    :initial-page="readQueryValue(route.query.page)"
    :initial-width="isMockupWidth(width) ? width : undefined"
    :initial-mode="isMockupMode(mode) ? mode : undefined"
  />
  <div v-else class="p-4 sm:p-6">
    <MockupIndex :base-path="route.path" />
  </div>
</template>
