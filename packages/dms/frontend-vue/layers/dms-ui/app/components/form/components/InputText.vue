<script setup lang="ts">
import type {
  InputProps,
  InputEmits,
  InputSlots,
} from "@nuxt/ui/components/Input.vue";
import { computed } from "vue";
import { useForwardPropsEmits } from "reka-ui";
import { characterCountText } from "../../../build/utils/characterCount";
import {
  type InputWidth,
  isCompactTextInput,
} from "../../../build/utils/inputWidth";

interface InputTextProps extends InputProps {
  /** Longest value accepted; the counter reads against it. */
  maxLength?: number;
  /** Shows the characters typed at the end of the field ("4 / 60"). */
  showCount?: boolean;
  /**
   * `"compact"` sizes the field for a short text from `sm` up, `"full"`
   * fills the row; left out, a `maxLength` of 16 or less makes it compact.
   */
  width?: InputWidth;
  /** How the value reads shown, not edited (a URL's image): not the input's. */
  preview?: "avatar" | "image";
}

const props = defineProps<InputTextProps>();
const emits = defineEmits<InputEmits>();
defineSlots<InputSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const inputProps = computed(() => {
  const {
    showCount: _showCount,
    width: _width,
    preview: _preview,
    ...rest
  } = forwarded.value;
  return rest;
});
const isCompact = computed(() => isCompactTextInput(props));
const countText = computed(() =>
  characterCountText(props.modelValue, props.maxLength),
);
</script>

<template>
  <UInput v-bind="inputProps" :class="isCompact && 'sm:max-w-44'">
    <template v-if="props.showCount" #trailing>
      <span class="text-dimmed text-xs tabular-nums" data-character-count>
        {{ countText }}
      </span>
    </template>
  </UInput>
</template>
