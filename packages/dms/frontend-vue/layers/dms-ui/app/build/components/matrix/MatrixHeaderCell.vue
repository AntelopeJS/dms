<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import type { MatrixColumn } from "../../../types/matrix";
import { EYEBROW_CLASS } from "../../utils/eyebrow";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import { clampColumnWidth } from "../../composables/matrix/matrixColumns";
import { MATRIX_ALIGN_CLASSES } from "../../composables/matrix/matrixTones";
import { kindOf } from "../../composables/matrix/matrixValues";

/**
 * A column header: its icon and label (a sort button on a sortable grid,
 * cycling ascending, descending, none), its description as a dimmed line
 * and tooltip, a badge ("Base", "12 missing"), a meter (coverage), and the
 * drag handle of a resizable grid.
 */
interface MatrixHeaderCellProps {
  column: MatrixColumn;
  colIndex: number;
  width: number;
  stickyLeft?: number;
}

const props = withDefaults(defineProps<MatrixHeaderCellProps>(), {
  stickyLeft: undefined,
});

const matrix = useMatrixContext();
const { t } = useI18n();

const label = computed(() => matrix.text(props.column.label));
const description = computed(() =>
  props.column.description ? matrix.text(props.column.description) : "",
);
const isSortable = computed(() => matrix.options.sortable === true);
const sort = computed(() => {
  const current = matrix.query.state.value.sort;
  return current?.columnId === props.column.id ? current.direction : null;
});
const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;
const SORT_ICONS = { asc: "i-ph-arrow-up", desc: "i-ph-arrow-down" } as const;
const align = computed(
  () =>
    props.column.align ?? (kindOf(props.column) === "number" ? "end" : "start"),
);
const PROGRESS_SCALE = 100;
const progress = computed(() =>
  props.column.progress === undefined
    ? null
    : Math.max(0, Math.min(1, props.column.progress)) * PROGRESS_SCALE,
);

// One width update per frame while dragging; the listeners go with the header.
let frame = 0;
let detach: (() => void) | null = null;

function startResize(event: PointerEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth = props.width;
  const onMove = (move: PointerEvent) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() =>
      matrix.columns.resize(
        props.column.id,
        clampColumnWidth(startWidth + move.clientX - startX),
      ),
    );
  };
  const onUp = () => detach?.();
  detach = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    detach = null;
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function resizeByKey(event: KeyboardEvent): void {
  const STEP = 16;
  const deltas: Record<string, number> = { ArrowLeft: -STEP, ArrowRight: STEP };
  const delta = deltas[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  matrix.columns.resize(props.column.id, props.width + delta);
}

onBeforeUnmount(() => detach?.());
</script>

<template>
  <th
    scope="col"
    role="columnheader"
    :aria-colindex="props.colIndex"
    :aria-sort="sort ? ARIA_SORT[sort] : isSortable ? 'none' : undefined"
    class="group/head relative border-e border-b border-(--ui-border-default) bg-(--dms-bg-muted) px-3 py-1.5 align-bottom font-normal"
    :class="props.stickyLeft !== undefined && 'sticky z-30'"
    :style="
      props.stickyLeft !== undefined
        ? { left: `${props.stickyLeft}px` }
        : undefined
    "
  >
    <div
      class="flex min-w-0 items-center gap-1.5"
      :class="MATRIX_ALIGN_CLASSES[align]"
    >
      <UIcon
        v-if="props.column.icon"
        :name="props.column.icon"
        class="text-dimmed size-3.5 shrink-0"
      />
      <UTooltip :text="description" :disabled="!description">
        <button
          v-if="isSortable"
          type="button"
          class="hover:text-highlighted min-w-0 truncate"
          :class="[EYEBROW_CLASS, sort ? 'text-highlighted' : 'text-dimmed']"
          :aria-label="t('dms.matrix.sort_by', { column: label })"
          @click="matrix.query.toggleSort(props.column.id)"
        >
          {{ label }}
        </button>
        <span
          v-else
          class="text-dimmed min-w-0 truncate"
          :class="EYEBROW_CLASS"
        >
          {{ label }}
        </span>
      </UTooltip>
      <UIcon
        v-if="sort"
        :name="SORT_ICONS[sort]"
        class="text-primary size-3 shrink-0"
      />
      <DmsStatusPill
        v-if="props.column.badge"
        :label="matrix.text(props.column.badge)"
        :tone="props.column.badgeTone ?? 'neutral'"
        dot="none"
        size="sm"
        class="shrink-0"
      />
    </div>
    <p
      v-if="description"
      class="text-dimmed mt-0.5 truncate text-[11px]"
      :class="MATRIX_ALIGN_CLASSES[align]"
    >
      {{ description }}
    </p>
    <DmsMeter
      v-if="progress !== null"
      class="mt-1.5"
      :value="progress"
      :max="100"
      size="xs"
      format="none"
      :tone="props.column.progressTone ?? 'primary'"
    />
    <span
      v-if="matrix.options.resizableColumns"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :aria-label="t('dms.matrix.resize', { column: label })"
      :aria-valuenow="props.width"
      class="hover:bg-primary/40 focus-visible:bg-primary/40 absolute end-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none outline-none"
      @pointerdown="startResize"
      @keydown="resizeByKey"
      @click.stop
    />
  </th>
</template>
