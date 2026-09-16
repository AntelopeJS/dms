<script setup lang="ts">
interface DisplayPasswordProps {
  modelValue?: string;
}

const props = defineProps<DisplayPasswordProps>();
const { t } = useI18n();

const PASSWORD_MASK = "••••••••";

const isEmpty = computed(
  () =>
    props.modelValue === undefined ||
    props.modelValue === null ||
    props.modelValue === "",
);
</script>

<template>
  <div
    class="text-default flex min-h-9 items-center py-1.5 font-mono text-sm tracking-widest"
  >
    <span v-if="isEmpty" class="text-dimmed">
      {{ t("dms.form.empty_value") }}
    </span>
    <span v-else>{{ PASSWORD_MASK }}</span>
  </div>
</template>
