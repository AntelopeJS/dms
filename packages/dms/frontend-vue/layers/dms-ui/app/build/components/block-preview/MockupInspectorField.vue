<script setup lang="ts">
import { computed, useId } from "vue";
import {
  isBoolean,
  isNumber,
  isString,
} from "../../../../../dms-core/app/utils/type-check";
import type { MockupInspectorField } from "../../utils/mockupInspector";

/**
 * One visual option of a block, drawn with the control its schema asks for.
 * Emits the new value at each change; undefined unsets an optional option.
 */
const props = defineProps<{
  field: MockupInspectorField;
  value: unknown;
}>();
const emit = defineEmits<{ update: [value: unknown] }>();

const UNSET = "\u0000unset";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const { t } = useI18n();
const id = useId();

const text = computed(() =>
  isString(props.value) || isNumber(props.value) ? String(props.value) : "",
);
const isOptional = computed(() => !!props.field.option.optional);
const fallback = computed(() => props.field.option.default);
const shown = computed(() => props.value ?? fallback.value);

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function emitText(next: string | number): void {
  const value = String(next);
  emit("update", value === "" && isOptional.value ? undefined : value);
}

function emitNumber(next: string | number): void {
  if (next === "" && isOptional.value) {
    emit("update", undefined);
    return;
  }
  const value = Number(next);
  if (next !== "" && Number.isFinite(value)) emit("update", value);
}

const selectItems = computed(() => [
  ...(isOptional.value
    ? [{ label: t("dms.mockup.option_unset"), value: UNSET }]
    : []),
  ...props.field.choices,
]);
const selected = computed(() =>
  props.field.choices.some((choice) => choice.value === props.value)
    ? props.value
    : UNSET,
);

function emitChoice(next: unknown): void {
  emit("update", next === UNSET ? undefined : next);
}

const color = computed(() =>
  isString(props.value) && COLOR_PATTERN.test(props.value)
    ? props.value
    : "#000000",
);
</script>

<template>
  <div class="space-y-1.5" :data-dms-mockup-field="field.key">
    <label :for="id" class="text-muted block text-xs font-medium">
      {{ field.label }}
    </label>
    <UTextarea
      v-if="field.control === 'textarea'"
      :id="id"
      :model-value="text"
      :rows="3"
      autoresize
      class="w-full"
      :placeholder="field.option.ui?.placeholder"
      @update:model-value="emitText"
    />
    <UInput
      v-else-if="field.control === 'number'"
      :id="id"
      type="number"
      :model-value="text"
      class="w-full"
      :min="field.option.ui?.min"
      :max="field.option.ui?.max"
      :step="field.option.ui?.step"
      @update:model-value="emitNumber"
    />
    <div v-else-if="field.control === 'range'" class="flex items-center gap-2">
      <input
        :id="id"
        type="range"
        class="accent-primary min-w-0 flex-1"
        :value="isNumber(shown) ? shown : (field.option.ui?.min ?? 0)"
        :min="field.option.ui?.min"
        :max="field.option.ui?.max"
        :step="field.option.ui?.step"
        @input="emitNumber(inputValue($event))"
      />
      <span class="text-muted w-10 text-end text-xs tabular-nums">
        {{ text }}
      </span>
    </div>
    <USwitch
      v-else-if="field.control === 'switch'"
      :id="id"
      :model-value="isBoolean(shown) ? shown : false"
      @update:model-value="emit('update', $event)"
    />
    <div
      v-else-if="field.control === 'segmented'"
      :id="id"
      class="flex flex-wrap gap-1"
      role="group"
    >
      <UButton
        v-for="choice in field.choices"
        :key="String(choice.value)"
        size="xs"
        color="neutral"
        :variant="choice.value === shown ? 'soft' : 'outline'"
        :aria-pressed="choice.value === shown"
        @click="emit('update', choice.value)"
      >
        {{ choice.label }}
      </UButton>
    </div>
    <USelect
      v-else-if="field.control === 'select'"
      :id="id"
      :model-value="selected"
      :items="selectItems"
      class="w-full"
      @update:model-value="emitChoice"
    />
    <div v-else-if="field.control === 'color'" class="flex items-center gap-2">
      <input
        type="color"
        class="border-default size-8 shrink-0 cursor-pointer rounded border bg-transparent"
        :value="color"
        :aria-label="field.label"
        @input="emitText(inputValue($event))"
      />
      <UInput
        :id="id"
        :model-value="text"
        class="min-w-0 flex-1"
        @update:model-value="emitText"
      />
    </div>
    <UInput
      v-else
      :id="id"
      :model-value="text"
      class="w-full"
      :icon="field.control === 'icon' && text ? text : undefined"
      :placeholder="field.option.ui?.placeholder"
      @update:model-value="emitText"
    />
  </div>
</template>
