<script setup lang="ts">
import { useFormField } from "@nuxt/ui/composables/useFormField";
import DmsSegmented from "../../segmented/Segmented.vue";

type SegmentValue = string | number;

interface SegmentedSelectItem {
  label: string;
  value: SegmentValue;
  icon?: string;
  disabled?: boolean;
}

interface SegmentedSelectProps {
  id?: string;
  items: SegmentedSelectItem[];
  disabled?: boolean;
}

const props = defineProps<SegmentedSelectProps>();
const model = defineModel<SegmentValue | null | undefined>();

// The field state UFormField hands its control: the error ring and aria
// attributes go on the track, a pick re-validates the field.
const { color, ariaAttrs, emitFormChange } = useFormField();
const isInvalid = computed(() => color.value === "error");

function pick(value: SegmentValue | undefined): void {
  model.value = value;
  emitFormChange();
}
</script>

<template>
  <div
    :id="props.id"
    class="w-fit max-w-full rounded-[9px]"
    :class="isInvalid && 'ring-error ring-1'"
    v-bind="ariaAttrs"
  >
    <DmsSegmented
      :model-value="model ?? undefined"
      :items="props.items"
      :disabled="props.disabled"
      overflow="wrap"
      @update:model-value="pick"
    />
  </div>
</template>
