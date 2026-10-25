<script setup lang="ts">
import type { MatrixContext } from "../../composables/matrix/useMatrix";
import type { MatrixEdit } from "../../composables/matrix/matrixSaveEngine";
import { shownValueText } from "../../composables/matrix/matrixValues";

/** The review before a staged save: each change, row · column, before → after. */
interface MatrixReviewListProps {
  changes: MatrixEdit[];
  context: MatrixContext;
}

const props = defineProps<MatrixReviewListProps>();
const { t } = useI18n();

const rowLabel = (rowId: string) => {
  const row = props.context.rows.rowById.value.get(rowId);
  return row ? props.context.rowTitle(row) : rowId;
};
const columnLabel = (columnId: string) => {
  const column = props.context.columns.columnById.value.get(columnId);
  return column ? props.context.text(column.label) : columnId;
};
const shown = shownValueText;
</script>

<template>
  <div class="border-default max-h-80 overflow-auto rounded-md border">
    <table class="w-full border-separate border-spacing-0 text-[12.5px]">
      <thead class="sticky top-0 bg-(--dms-bg-muted)">
        <tr class="text-dimmed text-start font-mono text-[10.5px] uppercase">
          <th
            class="border-default border-b px-2.5 py-1.5 text-start font-semibold"
          >
            {{ t("dms.matrix.review.row") }}
          </th>
          <th
            class="border-default border-b px-2.5 py-1.5 text-start font-semibold"
          >
            {{ t("dms.matrix.review.column") }}
          </th>
          <th
            class="border-default border-b px-2.5 py-1.5 text-start font-semibold"
          >
            {{ t("dms.matrix.review.change") }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="change in props.changes"
          :key="`${change.rowId}:${change.columnId}`"
        >
          <td class="border-muted border-b px-2.5 py-1.5">
            {{ rowLabel(change.rowId) }}
          </td>
          <td class="border-muted text-muted border-b px-2.5 py-1.5">
            {{ columnLabel(change.columnId) }}
          </td>
          <td class="border-muted border-b px-2.5 py-1.5">
            <span class="flex min-w-0 items-center gap-1.5 font-mono">
              <s class="text-dimmed truncate">{{ shown(change.before) }}</s>
              <UIcon
                name="i-ph-arrow-right"
                class="text-dimmed size-3 shrink-0"
              />
              <span class="text-highlighted truncate">
                {{ shown(change.after) }}
              </span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
