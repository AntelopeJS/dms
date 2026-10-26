<script setup lang="ts">
import { computed } from "vue";
import type { MatrixColumn, MatrixRow } from "../../../types/matrix";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import {
  cellBackground,
  MATRIX_ALIGN_CLASSES,
  MATRIX_TONE_TEXT,
  MATRIX_TONE_TINTS,
} from "../../composables/matrix/matrixTones";
import {
  isEmptyValue,
  kindOf,
  shownValueText,
} from "../../composables/matrix/matrixValues";
import MatrixCellEditor from "./MatrixCellEditor.vue";
import MatrixCellValue from "./MatrixCellValue.vue";

/**
 * One cell of the grid (`role="gridcell"`): its value, what the server says
 * about it (tone, hint, hatching, issues, placeholder, previous value), its
 * edit (tinted, the old value struck through), its save (Saving, Saved, a
 * refusal with Retry or Discard, a conflict with Overwrite), and its editor.
 */
interface MatrixCellProps {
  row: MatrixRow;
  column: MatrixColumn;
  /** From 1, among the grid's columns (the row header is 1). */
  colIndex: number;
  /** Inline start of a pinned column, in pixels. */
  stickyStart?: number;
}

const props = withDefaults(defineProps<MatrixCellProps>(), {
  stickyStart: undefined,
});

/** Kinds picked from a list or toggled rather than typed. */
const POINTER_KINDS = new Set(["boolean", "select", "date"]);

const matrix = useMatrixContext();
const { t } = useI18n();
const { interaction, engine } = matrix;

const address = computed(() => ({
  rowId: props.row.id,
  columnId: props.column.id,
}));
const value = computed(() => matrix.valueOf(props.row, props.column.id));
const state = computed(() => matrix.cellState(props.row, props.column.id));
const edit = computed(() => engine.editOf(props.row.id, props.column.id));
const saveState = computed(() => engine.stateOf(props.row.id, props.column.id));
const isEditable = computed(() => matrix.isEditable(props.row, props.column));
const isFocused = computed(() =>
  interaction.isFocused(props.row.id, props.column.id),
);
const isEditing = computed(() =>
  interaction.isEditing(props.row.id, props.column.id),
);
// The keyboard enters the grid here while no cell has the focus. Read in
// the cell: a focus move then redraws the cells it concerns, not the grid.
const isEntry = computed(() => {
  if (interaction.focus.value) return false;
  const entry = matrix.entryCell.value;
  return entry?.rowId === props.row.id && entry.columnId === props.column.id;
});
const hasAction = computed(
  () => !isEditable.value && matrix.hasCellAction(props.row, props.column),
);
const kind = computed(() => kindOf(props.column));
const isNumber = computed(() => kind.value === "number");
const align = computed(
  () => props.column.align ?? (isNumber.value ? "end" : "start"),
);
const label = computed(
  () => `${matrix.rowTitle(props.row)} · ${matrix.text(props.column.label)}`,
);

const isCrossLit = computed(() => {
  const hover = interaction.hover.value;
  if (!matrix.options.crossHighlight || !hover) return false;
  return hover.rowId === props.row.id || hover.columnId === props.column.id;
});
const isHovered = computed(
  () =>
    matrix.options.crossHighlight &&
    interaction.hover.value?.rowId === props.row.id &&
    interaction.hover.value.columnId === props.column.id,
);

// Its save's state first, then what the server says of the cell, then the row's.
const tint = computed(() => {
  if (saveState.value === "error" || saveState.value === "conflict")
    return MATRIX_TONE_TINTS.error;
  if (edit.value) return MATRIX_TONE_TINTS.warning;
  if (state.value.tone) return MATRIX_TONE_TINTS[state.value.tone];
  return props.row.tone ? MATRIX_TONE_TINTS[props.row.tone] : undefined;
});

// The value before the edit, or the one the server says was there: struck
// through, unless there was none (an empty cell has nothing to strike).
const struck = computed(() => {
  if (edit.value && !edit.value.conflict) return edit.value.before;
  return state.value.previous;
});
const hasStruck = computed(
  () =>
    ((edit.value !== undefined && !edit.value.conflict) ||
      state.value.previous !== undefined) &&
    !isEmptyValue(struck.value),
);
const struckText = computed(() => shownValueText(struck.value));
const issues = computed(() =>
  (state.value.issues ?? []).map((issue) => matrix.text(issue)),
);
const failureMessage = computed(() => {
  const current = edit.value;
  if (!current) return "";
  // A failed Overwrite says why (the network, a refusal) before the conflict.
  if (current.message) return matrix.text(current.message);
  if (current.conflict)
    return t("dms.matrix.conflict", {
      value: shownValueText(current.conflict.current),
    });
  return "";
});
const title = computed(() => {
  if (edit.value && !edit.value.conflict)
    return t("dms.matrix.was", { value: struckText.value });
  return undefined;
});

// A click edits: hovered, the cell draws the frame of the input it opens.
// A switch is toggled, not typed into: it keeps its own look.
const isFramed = computed(
  () => isEditable.value && !state.value.disabled && kind.value !== "boolean",
);
const editCursor = computed(() =>
  POINTER_KINDS.has(kind.value) ? "cursor-pointer" : "cursor-text",
);

const cellClass = computed(() => [
  "group/cell relative h-[var(--dms-matrix-row-h)] border-e border-b border-(--ui-border-muted) px-3 py-0 align-middle outline-none",
  isCrossLit.value ? "bg-elevated" : "bg-(--dms-surface-card)",
  isFocused.value && "ring-primary z-[1] ring-2 ring-inset",
  isHovered.value &&
    !isFocused.value &&
    "ring-1 ring-(--ui-border-accented) ring-inset",
  state.value.disabled && "text-dimmed cursor-not-allowed",
  hasAction.value && "cursor-pointer",
  isEditable.value && !isEditing.value && editCursor.value,
  props.stickyStart !== undefined && "sticky z-10",
  state.value.tone && MATRIX_TONE_TEXT[state.value.tone],
]);
const cellStyle = computed(() => ({
  ...cellBackground({ tint: tint.value, isHatched: state.value.disabled }),
  ...(props.stickyStart !== undefined && {
    insetInlineStart: `${props.stickyStart}px`,
  }),
}));

const enterMove = computed(() => matrix.options.enterMove ?? "down");

function onEditorPanel(model: unknown): void {
  interaction.editing.value = null;
  matrix.openCellDrawer(address.value, {
    ...address.value,
    draft: model,
    hasDraft: true,
    isModel: true,
  });
}
</script>

<template>
  <td
    role="gridcell"
    data-matrix-cell
    :data-row-id="props.row.id"
    :data-column-id="props.column.id"
    :aria-colindex="props.colIndex"
    :aria-label="label"
    :aria-selected="isFocused"
    :aria-readonly="!isEditable || undefined"
    :aria-disabled="state.disabled || undefined"
    :tabindex="isFocused || isEntry ? 0 : -1"
    :title="title"
    :class="cellClass"
    :style="cellStyle"
    @click="interaction.onCellClick(address)"
    @mouseenter="interaction.hover.value = address"
    @focus="interaction.focus.value = address"
  >
    <MatrixCellEditor
      v-if="isEditing"
      :column="props.column"
      :value="value"
      :draft="interaction.editing.value?.draft"
      :has-draft="interaction.editing.value?.hasDraft"
      :label="label"
      :reference="
        state.placeholder ? matrix.text(state.placeholder) : undefined
      "
      :enter-move="enterMove"
      @commit="interaction.commitEdit"
      @cancel="interaction.stopEditing"
      @open-panel="onEditorPanel"
    />
    <template v-else>
      <span
        v-if="state.hint"
        class="text-dimmed pointer-events-none absolute end-1 top-0.5 font-mono text-[10px] leading-none tabular-nums"
      >
        {{ matrix.text(state.hint) }}
      </span>
      <UTooltip v-if="issues.length" :text="issues.join(' · ')">
        <UIcon
          name="i-ph-warning-fill"
          class="text-warning absolute start-0.5 top-0.5 size-3"
          :aria-label="issues.join(' · ')"
        />
      </UTooltip>
      <div
        class="flex min-w-0 items-center gap-1.5 overflow-hidden"
        :class="[
          MATRIX_ALIGN_CLASSES[align],
          isFramed &&
            'min-h-7 rounded-lg px-2 ring-(--ui-border-accented) ring-inset group-hover/cell:ring-1',
        ]"
      >
        <s
          v-if="hasStruck"
          class="text-dimmed shrink-0 truncate font-mono text-[11.5px]"
        >
          {{ struckText }}
        </s>
        <MatrixCellValue
          :column="props.column"
          :value="value"
          :row="props.row"
          :state="state"
          :class="edit && !edit.conflict && 'text-highlighted font-medium'"
        />
        <UIcon
          v-if="saveState === 'saving'"
          name="i-ph-circle-notch"
          class="text-muted size-3 shrink-0 animate-spin"
          :aria-label="t('dms.save_bar.saving')"
        />
        <UIcon
          v-else-if="saveState === 'saved'"
          name="i-ph-check"
          class="text-success size-3 shrink-0"
          :aria-label="t('dms.save_bar.saved')"
        />
      </div>
      <div
        v-if="saveState === 'error' || saveState === 'conflict'"
        class="text-error flex items-center gap-1 pb-1 text-[11px]"
        role="alert"
        @click.stop
        @dblclick.stop
      >
        <UIcon name="i-ph-warning-circle" class="size-3 shrink-0" />
        <span class="min-w-0 flex-1 truncate" :title="failureMessage">
          {{ failureMessage || t("dms.save_bar.not_saved") }}
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('dms.matrix.cell.discard')"
          @click="engine.discard(props.row.id, props.column.id)"
        />
        <UButton
          size="xs"
          color="error"
          variant="soft"
          :label="
            saveState === 'conflict'
              ? t('dms.matrix.cell.overwrite')
              : t('dms.save_bar.retry')
          "
          @click="
            saveState === 'conflict'
              ? engine.overwrite(props.row.id, props.column.id)
              : engine.retry(props.row.id, props.column.id)
          "
        />
      </div>
    </template>
  </td>
</template>
