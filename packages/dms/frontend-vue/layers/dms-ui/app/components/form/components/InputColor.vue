<script setup lang="ts">
interface InputColorProps {
  placeholder?: string;
  disabled?: boolean;
}

const props = defineProps<InputColorProps>();
const modelValue = defineModel<string | null | undefined>();

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = "#000000";

const swatchValue = computed(() =>
  modelValue.value && HEX_PATTERN.test(modelValue.value)
    ? modelValue.value
    : FALLBACK_COLOR,
);

const handlePickerInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  modelValue.value = target.value;
};

const handleTextInput = (value: string | number) => {
  const next = String(value).trim();
  modelValue.value = next === "" ? undefined : next;
};
</script>

<template>
  <div class="flex items-center gap-2">
    <label
      class="border-accented has-focus-visible:border-primary relative inline-flex size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-(--dms-bg-field) p-0.5 shadow-(--shadow-xs) has-focus-visible:outline-3 has-focus-visible:outline-(--dms-accent-tint-strong)"
      :class="{ 'cursor-not-allowed opacity-50': props.disabled }"
    >
      <span
        aria-hidden="true"
        class="size-full rounded-[5px]"
        :style="{ backgroundColor: swatchValue }"
      />
      <input
        type="color"
        class="absolute inset-0 size-full cursor-pointer opacity-0"
        :value="swatchValue"
        :disabled="props.disabled"
        @input="handlePickerInput"
      />
    </label>
    <UInput
      :model-value="modelValue ?? ''"
      :placeholder="props.placeholder ?? '#000000'"
      :disabled="props.disabled"
      class="flex-1"
      :ui="{ base: 'font-mono' }"
      @update:model-value="handleTextInput"
    />
  </div>
</template>
