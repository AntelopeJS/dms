<script setup lang="ts">
interface InputColorProps {
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}

const props = defineProps<InputColorProps>();

// The field state UFormField hands its control: the swatch and the hex input
// both show the error border, the input carries the aria attributes.
const {
  color,
  highlight,
  ariaAttrs,
  emitFormBlur,
  emitFormChange,
  emitFormInput,
} = useFormField(props);
const invalid = computed(() => color.value === "error");
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
  emitFormChange();
};

const handleTextInput = (value: string | number) => {
  const next = String(value).trim();
  modelValue.value = next === "" ? undefined : next;
  emitFormInput();
};
</script>

<template>
  <div class="flex items-center gap-2">
    <label
      class="relative inline-flex size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-(--dms-bg-field) p-0.5 shadow-(--shadow-xs) has-focus-visible:outline-3"
      :class="[
        invalid
          ? 'border-error has-focus-visible:border-error has-focus-visible:outline-(--dms-error-tint)'
          : 'border-accented has-focus-visible:border-primary has-focus-visible:outline-(--dms-accent-tint-strong)',
        { 'cursor-not-allowed opacity-50': props.disabled },
      ]"
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
      :id="props.id"
      :model-value="modelValue ?? ''"
      :color="color"
      :highlight="highlight"
      v-bind="ariaAttrs"
      :placeholder="props.placeholder ?? '#000000'"
      :disabled="props.disabled"
      class="flex-1"
      :ui="{ base: 'font-mono' }"
      @update:model-value="handleTextInput"
      @blur="emitFormBlur"
    />
  </div>
</template>
