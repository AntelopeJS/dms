<script setup lang="ts">
// The component of a drawer, modal or side panel action target that holds
// blocks of its own (a Card, a VStack, a Grid, a Tab): drawn as a page draws
// a layout block, its children mounted in its slots. The container's own
// props (`rowData`, `navigation`, `onSuccessCallback`…) and listeners go to
// the container block, as they go to a single block.
import { useAttrs } from "vue";
import DmsRecursiveComponent from "../../../components/RecursiveComponent.vue";

defineOptions({ inheritAttrs: false });

interface Props {
  /** The container block, its children resolved and filled with the row. */
  targetTree: ResolvedComponentInfo;
  pageId: string;
  componentId: string;
}

defineProps<Props>();

const attrs = useAttrs();
</script>

<template>
  <DmsRecursiveComponent
    :component="targetTree"
    :page-id="pageId"
    :component-id="componentId"
    :root-props="attrs"
  />
</template>
