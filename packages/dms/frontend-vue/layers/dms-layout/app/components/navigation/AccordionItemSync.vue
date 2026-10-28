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

watch(
  () => itemContext.open.value,
  (open) => {
    emit("state-change", props.itemId, open);
  },
  { immediate: true },
);

watchEffect(() => {
  const desired = props.isDesiredOpen(props.itemId);
  if (desired !== itemContext.open.value) {
    rootContext.changeModelValue(itemContext.value.value);
  }
});
</script>

<template>
  <!-- renderless: accordion state sync only, no visible DOM output -->
  <slot />
</template>
