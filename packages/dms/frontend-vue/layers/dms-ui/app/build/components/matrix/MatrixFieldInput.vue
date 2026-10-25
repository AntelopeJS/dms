<script setup lang="ts">
import { computed } from "vue";
import { resolveDmsComponent } from "../../../composables/resolveDmsComponent";
import type { MatrixCellKind, MatrixColumn } from "../../../types/matrix";
import { kindOf } from "../../composables/matrix/matrixValues";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The DMS form input of a column's kind, as a `Form` draws the same field:
 * text → InputText, longText → Textarea, number → InputNumber, json →
 * InputCode in JSON... Bound to the editor model of `editorModelOf`.
 */
interface MatrixFieldInputProps {
  column: MatrixColumn;
  modelValue: unknown;
  id?: string;
  disabled?: boolean;
  /** In a cell: one line, small; in a drawer: the field's full size. */
  surface?: "cell" | "drawer";
  invalid?: boolean;
  /** Edited as a text whatever its kind (a number typed into a cell). */
  asText?: boolean;
}

const props = withDefaults(defineProps<MatrixFieldInputProps>(), {
  id: undefined,
  disabled: false,
  surface: "drawer",
  invalid: false,
  asText: false,
});

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const { processText } = useComposedText();

/** An input of the DMS registry, and the options the column gives it. */
interface FieldEditor {
  component: string;
  options: (column: MatrixColumn, isCell: boolean) => Record<string, unknown>;
}

const DRAWER_TEXT_ROWS = 4;
const MAX_TEXT_ROWS = 12;
const CODE_MIN_LINES = 8;
const PLAIN_TEXT_LANGUAGE = "text";
const KEY_VALUE_COLUMN = {
  type: "string",
  component: { componentName: "dms-input-text" },
};

const selectItems = (column: MatrixColumn) =>
  (column.options ?? []).map((option) => ({
    label: processText(option.label),
    value: option.value,
    icon: option.icon,
  }));

const EDITORS: Record<MatrixCellKind, FieldEditor> = {
  text: { component: "dms-input-text", options: () => ({}) },
  longText: {
    component: "dms-textarea",
    options: (_column, isCell) => ({
      autoresize: true,
      rows: isCell ? 1 : DRAWER_TEXT_ROWS,
      maxrows: MAX_TEXT_ROWS,
    }),
  },
  number: {
    component: "dms-input-number",
    options: (column) => ({
      min: column.min,
      max: column.max,
      step: column.step ?? (column.integer ? 1 : undefined),
      // Out of range stays as typed: the grid says why it refuses it.
      clamp: false,
    }),
  },
  boolean: { component: "dms-switch", options: () => ({}) },
  date: { component: "dms-date-picker", options: () => ({}) },
  // No DMS input takes a date and a time: the browser's own, in local time.
  datetime: {
    component: "dms-input-text",
    options: () => ({ type: "datetime-local" }),
  },
  select: {
    component: "dms-select",
    options: (column) => ({ items: selectItems(column) }),
  },
  tags: {
    component: "dms-input-tags",
    options: (column) => ({
      suggestions: (column.options ?? []).map((option) => option.value),
    }),
  },
  json: {
    component: "dms-input-code",
    options: () => ({ language: "json", minLines: CODE_MIN_LINES }),
  },
  code: {
    component: "dms-input-code",
    options: (column) => ({
      language: column.language ?? PLAIN_TEXT_LANGUAGE,
      minLines: CODE_MIN_LINES,
    }),
  },
  richText: { component: "dms-rich-text", options: () => ({}) },
  keyValue: {
    component: "dms-key-value",
    options: () => ({ value: KEY_VALUE_COLUMN }),
  },
  address: { component: "dms-input-address", options: () => ({}) },
};

const editor = computed(() =>
  props.asText ? EDITORS.text : EDITORS[kindOf(props.column)],
);
const component = computed(() => resolveDmsComponent(editor.value.component));
const isCell = computed(() => props.surface === "cell");
const options = computed(() =>
  editor.value.options(props.column, isCell.value),
);
</script>

<template>
  <Component
    :is="component"
    :id="props.id"
    :model-value="props.modelValue"
    :disabled="props.disabled"
    :size="isCell ? 'sm' : undefined"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid || undefined"
    class="w-full"
    v-bind="options"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
