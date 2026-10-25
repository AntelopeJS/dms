<script setup lang="ts">
import { computed } from "vue";
import type { MatrixRow } from "../../../types/matrix";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import {
  MATRIX_TINT_CLASS,
  MATRIX_TONE_BAR,
  MATRIX_TONE_TINTS,
  tintStyle,
} from "../../composables/matrix/matrixTones";

/**
 * The sticky header of a row: its number in the gutter, its label and
 * description, an "Edited" mark on a row kept after it left the filters, the
 * route's refusal of the row, and the ⤢ button opening it in a drawer.
 */
interface MatrixRowHeaderCellProps {
  row: MatrixRow;
  /** From 1, across pages; none for a kept row. */
  number?: number;
  width: number;
}

const props = withDefaults(defineProps<MatrixRowHeaderCellProps>(), {
  number: undefined,
});

const matrix = useMatrixContext();
const { t } = useI18n();

const title = computed(() => matrix.rowTitle(props.row));
const description = computed(() =>
  props.row.description ? matrix.text(props.row.description) : "",
);
const isKept = computed(() => matrix.rows.keptIds.value.has(props.row.id));
const rowError = computed(() => {
  const message = matrix.engine.rowErrors.get(props.row.id);
  return message ? matrix.text(message) : "";
});
const isMissedTarget = computed(() =>
  matrix.misses.value.rows.has(props.row.id),
);
const hasNumbers = computed(() => matrix.options.rowHeader?.numbers === true);
const isLit = computed(
  () =>
    matrix.options.crossHighlight &&
    matrix.interaction.hover.value?.rowId === props.row.id,
);
const tint = computed(() =>
  props.row.tone ? MATRIX_TONE_TINTS[props.row.tone] : undefined,
);
</script>

<template>
  <th
    scope="row"
    role="rowheader"
    aria-colindex="1"
    class="group/rowhead sticky start-0 z-10 h-[var(--dms-matrix-row-h)] border-e border-b border-(--ui-border-muted) bg-(--dms-surface-card) px-0 py-0 text-start align-middle font-normal shadow-[4px_0_6px_-5px_rgb(0_0_0/0.25)]"
    :class="[
      tint && MATRIX_TINT_CLASS,
      props.row.tone && MATRIX_TONE_BAR[props.row.tone],
      isLit && !tint && 'bg-elevated',
    ]"
    :style="{ ...tintStyle(tint), width: `${props.width}px` }"
  >
    <div class="flex min-w-0 items-center gap-2 py-1 ps-2 pe-3">
      <span
        v-if="hasNumbers"
        class="text-dimmed w-7 shrink-0 text-end font-mono text-[10.5px] tabular-nums"
      >
        {{ props.number ?? "" }}
      </span>
      <div class="min-w-0 flex-1" :class="!hasNumbers && 'ps-1.5'">
        <div class="flex min-w-0 items-center gap-1.5">
          <span
            class="text-highlighted truncate text-[13px] font-medium"
            :title="title"
          >
            {{ title }}
          </span>
          <DmsStatusPill
            v-if="isKept"
            :label="t('dms.matrix.edited')"
            tone="info"
            dot="none"
            size="sm"
            class="shrink-0"
          />
          <UTooltip v-if="rowError" :text="rowError">
            <UIcon
              name="i-ph-warning-circle"
              class="text-error size-3.5 shrink-0"
              :aria-label="rowError"
            />
          </UTooltip>
          <UIcon
            v-if="isMissedTarget"
            name="i-ph-scales"
            class="text-error size-3.5 shrink-0"
            :aria-label="t('dms.matrix.target_missed')"
          />
        </div>
        <p
          v-if="description"
          class="text-dimmed truncate text-[11.5px]"
          :title="description"
        >
          {{ description }}
        </p>
      </div>
      <UButton
        v-if="matrix.hasRowPanel.value"
        icon="i-ph-arrows-out-simple"
        size="xs"
        color="neutral"
        variant="ghost"
        class="absolute end-1 bg-(--dms-surface-card) opacity-0 transition-opacity group-hover/rowhead:opacity-100 focus-visible:opacity-100"
        :aria-label="t('dms.matrix.open_row', { row: title })"
        :title="t('dms.matrix.open_row', { row: title })"
        @click.stop="matrix.openRowPanel(props.row.id)"
      />
    </div>
  </th>
</template>
