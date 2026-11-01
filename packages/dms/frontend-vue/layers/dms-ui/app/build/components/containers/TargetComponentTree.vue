<script setup lang="ts">
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
