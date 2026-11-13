<script setup lang="ts">
import MockupIndex from "../../build/components/block-preview/MockupIndex.vue";
import MockupWorkbench from "../../build/components/block-preview/MockupWorkbench.vue";
import { isMockupWidth, readQueryValue } from "../../build/utils/mockup";

/**
 * The dev-only `/mockup` page. `?name=` picks a mockup, which it draws live
 * with `?page=` and `?width=desktop|mobile` choosing the page and the frame
 * width; without a name it lists the mockups the backend holds.
 */
const route = useDmsRoute();

const name = readQueryValue(route.query.name);
const width = readQueryValue(route.query.width);
</script>

<template>
  <div class="p-4 sm:p-6">
    <MockupWorkbench
      v-if="name"
      :name="name"
      :initial-page="readQueryValue(route.query.page)"
      :initial-width="isMockupWidth(width) ? width : undefined"
    />
    <MockupIndex v-else :base-path="route.path" />
  </div>
</template>
