<script setup lang="ts">
/**
 * A module component used as a container. The backend declares its children
 * with `.child(key, block, { slot })`: a child with a slot name lands in that
 * slot, the others in the default one. Besides its own options it receives
 * what the DMS injects into every block: the page id, its component id (its
 * key, or its parent's id, `-child-`, then its key), the column count of its
 * children and, on a dynamic page, the route parameters.
 */
interface SlotFrameProps {
  title: string;
  pageId: string;
  componentId: string;
  childCount?: number;
  routeParams?: Record<string, string>;
}

const props = withDefaults(defineProps<SlotFrameProps>(), {
  childCount: 0,
  routeParams: undefined,
});

const slots = useSlots();
const NO_ROUTE_PARAMS = "None: not a dynamic page";

const injectedItems = computed(() => [
  { label: "pageId", value: props.pageId, type: "mono" as const },
  { label: "componentId", value: props.componentId, type: "mono" as const },
  { label: "childCount", value: props.childCount, type: "mono" as const },
  {
    label: "routeParams",
    value: props.routeParams
      ? JSON.stringify(props.routeParams)
      : NO_ROUTE_PARAMS,
    type: "mono" as const,
  },
]);
</script>

<template>
  <DmsCard :title="props.title">
    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="grid content-start gap-4">
        <slot />
        <DmsKeyValueList :items="injectedItems" dense />
      </div>
      <aside
        v-if="slots.aside"
        class="border-default grid content-start gap-2 rounded-md border border-dashed p-3"
      >
        <DmsEyebrow>#aside slot</DmsEyebrow>
        <slot name="aside" />
      </aside>
    </div>
  </DmsCard>
</template>
