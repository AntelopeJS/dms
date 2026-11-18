<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { MatrixColumn } from "../../../types/matrix";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import {
  MATRIX_COLUMN_FILTER_MODES,
  type MatrixColumnFilterMode,
} from "../../composables/matrix/matrixQuery";

/**
 * A column's header filter (`columnFilters`): the funnel, shown on hover and
 * while a filter is on, opens a "contains" / "is" filter on the column's
 * values, sent as `filter_<column>=<mode>:<value>`.
 */
interface MatrixColumnFilterMenuProps {
  column: MatrixColumn;
}

const props = defineProps<MatrixColumnFilterMenuProps>();
const matrix = useMatrixContext();
const { t } = useI18n();

const isOpen = ref(false);
const current = computed(
  () => matrix.query.state.value.filters[props.column.id],
);
const mode = ref<MatrixColumnFilterMode>("contains");
const value = ref("");
const label = computed(() => matrix.text(props.column.label));
const modeItems = computed(() =>
  MATRIX_COLUMN_FILTER_MODES.map((entry) => ({
    label: t(`dms.matrix.filter.${entry}`),
    value: entry,
  })),
);

watch(isOpen, (open) => {
  if (!open) return;
  mode.value = current.value?.mode ?? "contains";
  value.value = current.value?.value ?? "";
});

function apply(): void {
  const text = value.value.trim();
  matrix.query.setColumnFilter(
    props.column.id,
    text ? { mode: mode.value, value: text } : null,
  );
  isOpen.value = false;
}

function remove(): void {
  matrix.query.setColumnFilter(props.column.id, null);
  isOpen.value = false;
}
</script>

<template>
  <UPopover v-model:open="isOpen">
    <button
      type="button"
      class="shrink-0 rounded p-0.5 transition-opacity"
      :class="
        current
          ? 'text-primary opacity-100'
          : 'text-dimmed opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100'
      "
      :aria-label="t('dms.matrix.filter.title', { column: label })"
      :title="t('dms.matrix.filter.title', { column: label })"
    >
      <UIcon name="i-ph-funnel" class="size-3" />
    </button>
    <template #content>
      <form class="w-60 space-y-2 p-3" @submit.prevent="apply">
        <p class="text-muted text-xs">{{ label }}</p>
        <USelect
          v-model="mode"
          :items="modeItems"
          size="xs"
          class="w-full"
          :aria-label="t('dms.matrix.filter.mode')"
        />
        <UInput
          v-model="value"
          size="xs"
          class="w-full"
          autofocus
          :aria-label="t('dms.matrix.filter.value')"
        />
        <div class="flex justify-end gap-1.5">
          <UButton
            v-if="current"
            size="xs"
            variant="ghost"
            color="neutral"
            :label="t('dms.matrix.filter.remove')"
            @click="remove"
          />
          <UButton
            size="xs"
            type="submit"
            :label="t('dms.matrix.filter.apply')"
          />
        </div>
      </form>
    </template>
  </UPopover>
</template>
