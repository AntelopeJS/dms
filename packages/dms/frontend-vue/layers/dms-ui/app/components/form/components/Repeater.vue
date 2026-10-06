<script setup lang="ts">
import {
  formErrorsInjectionKey,
  formInputsInjectionKey,
  useFormField,
} from "@nuxt/ui/composables/useFormField";
import { resolveDmsComponent } from "../../../composables/resolveDmsComponent";

/** A field of the rows: one column. */
interface RepeaterColumn {
  id: string;
  label?: string;
  type?: string;
  component: { componentName?: string; options?: Record<string, unknown> };
  required?: boolean;
}

type RepeaterRow = Record<string, unknown>;

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

// Taken here so the inputs of the rows do not each pick up the whole
// field's error: each cell shows its own (`<field>.<row>.<column>`).
const { name: fieldName, emitFormChange } = useFormField();
const formErrors = inject(formErrorsInjectionKey, null);
const formInputs = inject(formInputsInjectionKey, null);

const rows = computed<RepeaterRow[]>(() =>
  Array.isArray(model.value) ? model.value : [],
);

// Stable keys for the rows, kept in step with the list: a row keeps its
// inputs (and their focus) while another is added, removed or moved.
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
// A box to tick takes its own width; any other field shares the row.
const FLUID_COLUMN = "minmax(0,1fr)";
const COLUMN_WIDTHS: Record<string, string> = { boolean: "20px" };
const gridTemplate = computed(() => ({
  gridTemplateColumns: [
    props.sortable ? "20px" : "",
    ...props.columns.map(
      (column) => COLUMN_WIDTHS[column.type ?? ""] ?? FLUID_COLUMN,
    ),
    "28px",
  ]
    .filter(Boolean)
    .join(" "),
}));

function emitRows(next: RepeaterRow[]): void {
  model.value = next;
  emitFormChange();
}

function setCell(index: number, column: string, value: unknown): void {
  emitRows(
    rows.value.map((row, at) =>
      at === index ? { ...row, [column]: value } : row,
    ),
  );
}

function addRow(): void {
  rowKeys.value.push(nextKey++);
  emitRows([...rows.value, {}]);
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

const MOVE_KEYS: Record<string, number> = { ArrowUp: -1, ArrowDown: 1 };

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

// Each cell is an input of the form, so an error a server raises on one
// (`headers.1.value`) lands on it rather than being dropped.
watch(
  () => [fieldName.value, rows.value.length] as const,
  ([name, length], previous) => {
    if (!name || !formInputs) return;
    const previousLength = previous?.[1] ?? 0;
    for (let index = length; index < previousLength; index++) {
      for (const column of props.columns) {
        delete formInputs.value[cellName(index, column.id)];
      }
    }
    for (let index = 0; index < length; index++) {
      for (const column of props.columns) {
        const cell = cellName(index, column.id);
        formInputs.value[cell] = { id: cell };
      }
    }
  },
  { immediate: true },
);

function cellComponent(column: RepeaterColumn) {
  const name = column.component.componentName;
  return name ? resolveDmsComponent(name) || name : null;
}

const hasHeaders = computed(() => props.columns.some((column) => column.label));
</script>

<template>
  <div :id="props.id" class="grid gap-1.5" role="group">
    <div
      v-if="hasHeaders && rows.length"
      class="text-dimmed grid items-end gap-2 font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
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
      class="grid items-center gap-2"
      :class="draggedIndex === index && 'opacity-50'"
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
      <Component
        :is="cellComponent(column)"
        v-for="column in props.columns"
        :id="cellName(index, column.id)"
        :key="column.id"
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
