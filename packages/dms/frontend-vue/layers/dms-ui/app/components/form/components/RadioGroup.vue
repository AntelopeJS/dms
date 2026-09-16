<script
  setup
  lang="ts"
  generic="T extends RadioGroupItem[], VK extends GetItemKeys<T> = 'value'"
>
import type {
  RadioGroupProps,
  RadioGroupEmits,
  RadioGroupSlots,
  RadioGroupItem,
} from "@nuxt/ui/components/RadioGroup.vue";
import { useForwardPropsEmits } from "reka-ui";
import type { GetItemKeys } from "@nuxt/ui/runtime/types/utils.js";

const props = defineProps<RadioGroupProps<T, VK>>();
const emits = defineEmits<RadioGroupEmits>();
defineSlots<RadioGroupSlots<T>>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <URadioGroup v-bind="forwarded" />
</template>
