<script setup lang="ts">
import type {
  InputProps,
  InputEmits,
  InputSlots,
} from "@nuxt/ui/components/Input.vue";
import { computed } from "vue";
import { useForwardPropsEmits } from "reka-ui";
import { characterCountText } from "../../../build/utils/characterCount";

interface InputTextProps extends InputProps {
  /** Longest value accepted; the counter reads against it. */
  maxLength?: number;
  /** Shows the characters typed at the end of the field ("4 / 60"). */
  showCount?: boolean;
}

const props = defineProps<InputTextProps>();
const emits = defineEmits<InputEmits>();
defineSlots<InputSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const inputProps = computed(() => {
  const { showCount: _showCount, ...rest } = forwarded.value;
  return rest;
});
const countText = computed(() =>
  characterCountText(props.modelValue, props.maxLength),
);
</script>

<template>
  <UInput v-bind="inputProps">
    <template v-if="props.showCount" #trailing>
      <span class="text-dimmed text-xs tabular-nums" data-character-count>
        {{ countText }}
      </span>
    </template>
  </UInput>
</template>
