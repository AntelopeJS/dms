<script setup lang="ts">
import {
  injectAccordionItemContext,
  injectAccordionRootContext,
} from "reka-ui";

interface Props {
  itemId: string;
  isDesiredOpen: (id: string) => boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "state-change": [id: string, open: boolean];
}>();

const itemContext = injectAccordionItemContext();
const rootContext = injectAccordionRootContext();

// Push accordion state out (user toggles, initial defaultOpen).
watch(
  () => itemContext.open.value,
  (open) => {
    emit("state-change", props.itemId, open);
  },
  { immediate: true },
);

// Pull desired state in (route navigation merges required ids). When the
// parent says this item should be open/closed but the accordion disagrees,
// flip it via Reka's own toggle so each nested AccordionRoot stays the
// source of truth for its own visual state.
watchEffect(() => {
  const desired = props.isDesiredOpen(props.itemId);
  if (desired !== itemContext.open.value) {
    rootContext.changeModelValue(itemContext.value.value as string);
  }
});
</script>

<template>
  <!-- renderless: accordion state sync only, no visible DOM output -->
  <slot />
</template>
