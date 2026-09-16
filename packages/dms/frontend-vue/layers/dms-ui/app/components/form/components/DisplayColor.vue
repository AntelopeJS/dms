<script setup lang="ts">
interface DisplayColorProps {
  modelValue?: string | null;
}

const props = defineProps<DisplayColorProps>();
const { t } = useI18n();

const isEmpty = computed(
  () =>
    props.modelValue === undefined ||
    props.modelValue === null ||
    props.modelValue === "",
);
</script>

<template>
  <div class="text-default flex min-h-9 items-center gap-2 py-1.5 text-sm">
    <span v-if="isEmpty" class="text-dimmed">
      {{ t("dms.form.empty_value") }}
    </span>
    <template v-else>
      <span
        aria-hidden="true"
        class="border-default size-5 rounded-md border"
        :style="{ backgroundColor: modelValue ?? undefined }"
      />
      <span class="font-mono">{{ modelValue }}</span>
    </template>
  </div>
</template>
