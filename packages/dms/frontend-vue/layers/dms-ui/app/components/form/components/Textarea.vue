<script setup lang="ts">
import type {
  TextareaProps,
  TextareaEmits,
  TextareaSlots,
} from "@nuxt/ui/components/Textarea.vue";
import { computed } from "vue";
import { useForwardPropsEmits } from "reka-ui";
import { characterCountText } from "../../../build/utils/characterCount";

interface TextareaFieldProps extends TextareaProps {
  /** Longest value accepted; the counter reads against it. */
  maxLength?: number;
  /** Shows the characters typed under the field ("4 / 60"). */
  showCount?: boolean;
}

const props = defineProps<TextareaFieldProps>();
const emits = defineEmits<TextareaEmits>();
defineSlots<TextareaSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const textareaProps = computed(() => {
  const { showCount: _showCount, ...rest } = forwarded.value;
  return rest;
});
const countText = computed(() =>
  characterCountText(props.modelValue, props.maxLength),
);
</script>

<template>
  <div v-if="props.showCount" class="grid gap-1">
    <UTextarea v-bind="textareaProps" class="w-full" />
    <span
      class="text-dimmed justify-self-end text-xs tabular-nums"
      data-character-count
    >
      {{ countText }}
    </span>
  </div>
  <UTextarea v-else v-bind="textareaProps" />
</template>
