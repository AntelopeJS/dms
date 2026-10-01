<script setup lang="ts">
import type {
  CheckboxProps,
  CheckboxEmits,
  CheckboxSlots,
} from "@nuxt/ui/components/Checkbox.vue";
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<CheckboxProps>();
const emits = defineEmits<CheckboxEmits>();
defineSlots<CheckboxSlots>();

const forwarded = useForwardPropsEmits(props, emits);

// The app-wide light icon weight is too thin inside a 16px box.
const CHECK_ICON = "i-ph-check-bold";
const INDETERMINATE_ICON = "i-ph-minus-bold";
</script>

<template>
  <UCheckbox
    v-bind="forwarded"
    :icon="props.icon ?? CHECK_ICON"
    :indeterminate-icon="props.indeterminateIcon ?? INDETERMINATE_ICON"
  />
</template>
