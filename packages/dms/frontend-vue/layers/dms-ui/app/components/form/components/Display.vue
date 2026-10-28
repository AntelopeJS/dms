<script setup lang="ts">
import { isVNode } from "vue";
import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { isString } from "#dms-core/app/utils/type-check";
import { NUMERIC_TYPE_IDS } from "../../../build/composables/data-types/useColumnValueRenderer";

interface DisplayProps {
  modelValue?: unknown;
  type?: string;
  loading?: boolean;
  /** The field's label, which names the value where it is not text (an image). */
  label?: string;
  /** The record the value belongs to, read as a grid cell reads its row. */
  row?: Record<string, NonNullable<Parameters<DataTypeFormatter>[3]>[string]>;
}

const props = defineProps<DisplayProps>();

const options = useAttrs();

const { getDataType } = useDataTypes();
const { locale, t } = useI18n();

const EMPTY_FALLBACK = "—";

const dataType = computed(() =>
  props.type ? getDataType(props.type) : undefined,
);
const dedicatedComponent = computed(() => dataType.value?.displayComponent);

const isEmptyValue = (value: DisplayProps["modelValue"]): boolean => {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const formattedValue = computed(() => {
  if (isEmptyValue(props.modelValue)) return EMPTY_FALLBACK;
  const formatter = dataType.value?.formatter?.default;
  if (!formatter) return String(props.modelValue);
  const formatterOptions = props.label
    ? { ...options, fieldLabel: props.label }
    : options;
  return formatter(props.modelValue, locale.value, formatterOptions, props.row);
});

const isVNodeValue = computed(() => isVNode(formattedValue.value));

const isNumeric = computed(() => NUMERIC_TYPE_IDS.has(props.type ?? ""));
</script>

<template>
  <USkeleton
    :aria-label="t('dms.a11y.loading')"
    v-if="loading"
    class="h-9 w-full"
  />

  <Component
    :is="dedicatedComponent"
    v-else-if="dedicatedComponent"
    :model-value="modelValue"
    v-bind="$attrs"
  />

  <div
    v-else
    class="text-default flex min-h-9 items-center py-1.5 text-sm"
    :class="isNumeric && 'tabular-nums'"
    :title="isString(formattedValue) ? formattedValue : undefined"
  >
    <component :is="formattedValue" v-if="isVNodeValue" />
    <span v-else-if="formattedValue === EMPTY_FALLBACK" class="text-dimmed">
      {{ t("dms.form.empty_value") }}
    </span>
    <span v-else>{{ formattedValue }}</span>
  </div>
</template>
