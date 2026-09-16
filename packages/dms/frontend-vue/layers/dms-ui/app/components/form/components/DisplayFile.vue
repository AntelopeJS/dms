<script setup lang="ts">
import FilePreview from "../../table-view/FilePreview.vue";

interface DisplayFileProps {
  modelValue?: string | string[];
  multiple?: boolean;
  storage?: string;
}

const props = defineProps<DisplayFileProps>();
const { t } = useI18n();

const items = computed<string[]>(() => {
  const value = props.modelValue;
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
});

const isEmpty = computed(() => items.value.length === 0);
</script>

<template>
  <span v-if="isEmpty" class="text-dimmed py-1.5 text-sm">
    {{ t("dms.form.empty_value") }}
  </span>
  <div v-else class="flex flex-col gap-1.5 py-1.5">
    <FilePreview
      v-for="resourceKey in items"
      :key="resourceKey"
      :resource-key="resourceKey"
      :storage="storage"
    />
  </div>
</template>
