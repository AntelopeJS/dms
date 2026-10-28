<script setup lang="ts">
import { EYEBROW_CLASS } from "../../../build/utils/eyebrow";
import {
  formErrorsInjectionKey,
  formInputsInjectionKey,
  useFormField,
} from "@nuxt/ui/composables/useFormField";
import { resolveDmsComponent } from "../../../composables/resolveDmsComponent";
import DmsRepeaterTable from "./RepeaterTable.vue";
import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";

/** A field of the rows: one column. */
interface RepeaterColumn {
  id: string;
  label?: string;
  type?: string;
  component: ComponentInfo;
  required?: boolean;
}

type RepeaterRow = NonNullable<Parameters<DataTypeFormatter>[3]>;

interface RepeaterProps {
  id?: string;
  columns: RepeaterColumn[];
  sortable?: boolean;
  min?: number;
  max?: number;
  /** Label of the "+ Add …" button; a generic one by default. */
  addLabel?: string;
  /** Grey help line under the rows. */
  hint?: string;
  disabled?: boolean;
}

const props = defineProps<RepeaterProps>();
const model = defineModel<RepeaterRow[] | null | undefined>();
const { t } = useI18n();

const { name: fieldName, emitFormChange } = useFormField();
const formErrors = inject(formErrorsInjectionKey, null);
const formInputs = inject(formInputsInjectionKey, null);

const rows = computed<RepeaterRow[]>(() =>
  Array.isArray(model.value) ? model.value : [],
);

let nextKey = 0;
const rowKeys = ref<number[]>([]);
watch(
  () => rows.value.length,
  (length) => {
    while (rowKeys.value.length < length) rowKeys.value.push(nextKey++);
    rowKeys.value.length = length;
  },
  { immediate: true },
);

const canAdd = computed(
  () =>
    !props.disabled &&
    (props.max === undefined || rows.value.length < props.max),
);
const canRemove = computed(
  () => !props.disabled && rows.value.length > (props.min ?? 0),
);

const FLUID_COLUMN = "minmax(0,1fr)";
type ColumnWidths = Record<NonNullable<RepeaterColumn["type"]>, string>;
const COLUMN_WIDTHS: ColumnWidths = { boolean: "20px" };
const HANDLE_COLUMN = "20px";
const REMOVE_COLUMN = "28px";

/** The columns of a row: the handle, the given cell columns, the remove button. */
function rowTemplate(cellColumns: string[]): string {
  return [props.sortable ? HANDLE_COLUMN : "", ...cellColumns, REMOVE_COLUMN]
    .filter(Boolean)
    .join(" ");
}

const STACKED_HIDDEN_CLASS = "@max-[30rem]:hidden";
const STACKED_ROW_CLASSES = {
  row: "@max-[30rem]:grid-cols-(--dms-repeater-stacked-columns) @max-[30rem]:items-start @max-[30rem]:rounded-md @max-[30rem]:border @max-[30rem]:border-default @max-[30rem]:p-2.5",

  cells: "contents @max-[30rem]:grid @max-[30rem]:min-w-0 @max-[30rem]:gap-2.5",
  cell: "grid min-w-0 gap-1",
  label: `${EYEBROW_CLASS} text-dimmed hidden truncate @max-[30rem]:block`,
};
const gridTemplate = computed(() => ({
  "--dms-repeater-columns": rowTemplate(
    props.columns.map(
      (column) => COLUMN_WIDTHS[column.type ?? ""] ?? FLUID_COLUMN,
    ),
  ),
  "--dms-repeater-stacked-columns": rowTemplate([FLUID_COLUMN]),
}));

/**
 * Sets the rows; `shouldValidate: false` leaves the form's validation alone: a row
 * just added is empty, and is only checked once filled or on submit, never
 * flagged "required" the moment it appears.
 */
function emitRows(next: RepeaterRow[], shouldValidate = true): void {
  model.value = next;
  if (shouldValidate) emitFormChange();
}

function setCell(
  index: number,
  column: string,
  value: RepeaterRow[string],
): void {
  emitRows(
    rows.value.map((row, at) =>
      at === index ? { ...row, [column]: value } : row,
    ),
  );
}

function addRow(): void {
  rowKeys.value.push(nextKey++);
  emitRows([...rows.value, {}], false);
}

function removeRow(index: number): void {
  rowKeys.value.splice(index, 1);
  emitRows(rows.value.filter((_, at) => at !== index));
}

function moveRow(from: number, to: number): void {
  if (to < 0 || to >= rows.value.length || from === to) return;
  const next = [...rows.value];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row!);
  const [key] = rowKeys.value.splice(from, 1);
  rowKeys.value.splice(to, 0, key!);
  emitRows(next);
}

type MoveKeys = Record<KeyboardEvent["key"], number>;
const MOVE_KEYS: MoveKeys = { ArrowUp: -1, ArrowDown: 1 };

function onHandleKeydown(event: KeyboardEvent, index: number): void {
  const step = MOVE_KEYS[event.key];
  if (step === undefined) return;
  event.preventDefault();
  moveRow(index, index + step);
}

const draggedIndex = ref<number | null>(null);

function onDrop(index: number): void {
  if (draggedIndex.value !== null) moveRow(draggedIndex.value, index);
  draggedIndex.value = null;
}

/** The name a cell's errors go under, and the id of its control. */
function cellName(index: number, column: string): string {
  return `${fieldName.value ?? props.id ?? "rows"}.${index}.${column}`;
}

function isCellInvalid(index: number, column: string): boolean {
  const name = cellName(index, column);
  return !!formErrors?.value.some((error) => error.name === name);
}

function cellNames(length: number): string[] {
  return Array.from({ length }, (_, index) =>
    props.columns.map((column) => cellName(index, column.id)),
  ).flat();
}

function unregisterCells(names: readonly string[]): void {
  for (const name of names) delete formInputs?.value[name];
}

let registered: string[] = [];
watch(
  () => [fieldName.value, rows.value.length] as const,
  ([name, length]) => {
    unregisterCells(registered);
    registered = name && formInputs ? cellNames(length) : [];
    for (const cell of registered) formInputs!.value[cell] = { id: cell };
  },
  { immediate: true },
);
onBeforeUnmount(() => unregisterCells(registered));

function cellComponent(column: RepeaterColumn) {
  const name = column.component.componentName;
  return name ? resolveDmsComponent(name) || name : null;
}

const hasHeaders = computed(() => props.columns.some((column) => column.label));
</script>

<template>
  <!-- Read-only, the rows are values to read, not controls: a table. -->
  <DmsRepeaterTable
    v-if="props.disabled"
    :id="props.id"
    :columns="props.columns"
    :rows="rows"
  />
  <div v-else :id="props.id" class="@container grid gap-1.5" role="group">
    <div
      v-if="hasHeaders && rows.length"
      :class="[
        EYEBROW_CLASS,
        'text-dimmed grid grid-cols-(--dms-repeater-columns) items-end gap-2',
        STACKED_HIDDEN_CLASS,
      ]"
      :style="gridTemplate"
      aria-hidden="true"
    >
      <span v-if="props.sortable" />
      <span v-for="column in props.columns" :key="column.id" class="truncate">
        {{ column.label }}
      </span>
      <span />
    </div>

    <div
      v-for="(row, index) in rows"
      :key="rowKeys[index]"
      :class="[
        'grid grid-cols-(--dms-repeater-columns) items-center gap-2',
        STACKED_ROW_CLASSES.row,
        draggedIndex === index && 'opacity-50',
      ]"
      :style="gridTemplate"
      @dragover.prevent
      @drop.prevent="onDrop(index)"
    >
      <button
        v-if="props.sortable"
        type="button"
        class="text-dimmed hover:text-default grid h-8 cursor-grab place-items-center rounded-md"
        :draggable="!props.disabled"
        :disabled="props.disabled"
        :aria-label="t('dms.form.repeater.move', { row: index + 1 })"
        @dragstart="draggedIndex = index"
        @dragend="draggedIndex = null"
        @keydown="onHandleKeydown($event, index)"
      >
        <UIcon name="i-ph-dots-six-vertical" class="size-4" />
      </button>
      <div :class="STACKED_ROW_CLASSES.cells">
        <div
          v-for="column in props.columns"
          :key="column.id"
          :class="STACKED_ROW_CLASSES.cell"
        >
          <span
            v-if="column.label"
            :class="STACKED_ROW_CLASSES.label"
            aria-hidden="true"
          >
            {{ column.label }}
          </span>
          <Component
            :is="cellComponent(column)"
            :id="cellName(index, column.id)"
            :model-value="row[column.id]"
            size="sm"
            class="w-full min-w-0"
            :disabled="props.disabled"
            :aria-label="column.label"
            :aria-invalid="isCellInvalid(index, column.id) || undefined"
            :color="isCellInvalid(index, column.id) ? 'error' : undefined"
            :highlight="isCellInvalid(index, column.id) || undefined"
            v-bind="column.component.options || {}"
            @update:model-value="setCell(index, column.id, $event)"
          />
        </div>
      </div>
      <UButton
        icon="i-ph-x"
        color="neutral"
        variant="ghost"
        size="sm"
        class="text-dimmed"
        :disabled="!canRemove"
        :aria-label="t('dms.form.repeater.remove', { row: index + 1 })"
        @click="removeRow(index)"
      />
    </div>

    <p v-if="props.hint" class="text-dimmed text-xs">{{ props.hint }}</p>

    <div>
      <UButton
        v-if="canAdd"
        icon="i-ph-plus"
        :label="props.addLabel || t('dms.form.repeater.add')"
        color="primary"
        variant="link"
        size="sm"
        class="px-0"
        @click="addRow"
      />
    </div>
  </div>
</template>
