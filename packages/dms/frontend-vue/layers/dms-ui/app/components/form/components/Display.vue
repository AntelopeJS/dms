<script setup lang="ts">
import { isVNode } from "vue";

interface DisplayProps {
  modelValue?: unknown;
  type?: string;
  loading?: boolean;
}

const props = defineProps<DisplayProps>();

const { getDataType } = useDataTypes();
const { locale, t } = useI18n();

const EMPTY_FALLBACK = "—";

const dataType = computed(() =>
  props.type ? getDataType(props.type) : undefined,
);
const dedicatedComponent = computed(() => dataType.value?.displayComponent);

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const formattedValue = computed(() => {
  if (isEmptyValue(props.modelValue)) return EMPTY_FALLBACK;
  const formatter = dataType.value?.formatter?.default;
  if (!formatter) return String(props.modelValue);
  return formatter(props.modelValue, locale.value, props);
});

const isVNodeValue = computed(() => isVNode(formattedValue.value));
</script>

<template>
  <USkeleton v-if="loading" class="h-9 w-full" />

  <Component
    :is="dedicatedComponent"
    v-else-if="dedicatedComponent"
    :model-value="modelValue"
    v-bind="$attrs"
  />

  <div
    v-else
    class="text-default flex min-h-9 items-center py-1.5 text-sm"
    :title="typeof formattedValue === 'string' ? formattedValue : undefined"
  >
    <component :is="formattedValue" v-if="isVNodeValue" />
    <span v-else-if="formattedValue === EMPTY_FALLBACK" class="text-dimmed">
      {{ t("dms.form.empty_value") }}
    </span>
    <span v-else>{{ formattedValue }}</span>
  </div>
</template>
