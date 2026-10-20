<script setup lang="ts">
/**
 * What a side panel or a drawer opened on a row shows in place of its
 * component when the row its link names is gone (a 404): the state, and a
 * close button.
 */
import { computed } from "vue";
import DmsEmptyState from "../../../../components/empty-state/EmptyState.vue";

interface RowNotFoundProps {
  title: string;
  description: string;
}

interface RowNotFoundEmits {
  (e: "close"): void;
}

defineProps<RowNotFoundProps>();
const emit = defineEmits<RowNotFoundEmits>();

const { t } = useI18n();

const actions = computed(() => [
  {
    label: t("side_panel.close"),
    icon: "i-ph-x",
    color: "neutral" as const,
    variant: "outline" as const,
    onClick: () => emit("close"),
  },
]);
</script>

<template>
  <DmsEmptyState
    data-dms-row-not-found
    variant="no-result"
    :title="title"
    :description="description"
    :actions="actions"
    class="py-10"
  />
</template>
