<script setup lang="ts" generic="T extends Data">
import { nextTick, useId } from "vue";
import { onClickOutside } from "@vueuse/core";
import { FlexRender, type CellContext } from "@tanstack/vue-table";
import type { Data } from "../../../types/table";
import type { TableInlineEdit } from "../../composables/table-view/useTableInlineEdit";
import { processFieldI18n } from "../../utils/fieldOptionsI18n";

interface InlineEditCellProps {
  /** The cell, as the grid hands it to a `<column>-cell` slot. */
  cell: CellContext<T, unknown>;
  inlineEdit: TableInlineEdit<T>;
}

const props = defineProps<InlineEditCellProps>();
const { t } = useI18n();
const { processI18n } = useTranslation();

// A picker's content is teleported out of the cell: focus or a click there
// is still the cell's.
const POPOVER_SELECTOR = "[data-reka-popper-content-wrapper]";
const FOCUSABLE_SELECTOR =
  "input, select, textarea, button, [tabindex]:not([tabindex='-1'])";
// What the display of a cell may hold that a click uses for itself.
const DISPLAY_CONTROL_SELECTOR = "a, button";
// Texts beside a switch or a checkbox: in a cell, the column header says it.
const TOGGLE_TEXT_OPTIONS = new Set(["label", "description"]);

const row = computed(() => props.cell.row.original);
const columnId = computed(() => props.cell.column.id);
const column = computed(() => props.inlineEdit.columnOf(columnId.value));
const isEditable = computed(() =>
  props.inlineEdit.isCellEditable(row.value, columnId.value),
);
const isEditing = computed(() =>
  props.inlineEdit.isEditing(row.value, columnId.value),
);
const isSaving = computed(() =>
  props.inlineEdit.isSaving(row.value, columnId.value),
);
const isInvalid = computed(() =>
  props.inlineEdit.isInvalid(row.value, columnId.value),
);

const columnDef = computed(
  () =>
    props.cell.column.columnDef as {
      cellWrap?: boolean;
      meta?: { label?: string };
    },
);
const textClass = computed(() =>
  columnDef.value.cellWrap
    ? "line-clamp-none whitespace-normal [overflow-wrap:anywhere]"
    : "line-clamp-1 text-ellipsis",
);

const inputId = useId();
const inputLabel = computed(() =>
  t("dms.table.inline_edit.cell", {
    column: columnDef.value.meta?.label ?? columnId.value,
    row: props.inlineEdit.rowLabel(row.value),
  }),
);

const control = computed(() =>
  resolveDmsComponent(column.value?.field.component.componentName),
);
const controlOptions = computed<Record<string, unknown>>(() => {
  const target = column.value;
  if (!target) return {};
  const options = {
    ...(processFieldI18n(target.field, processI18n).component.options ?? {}),
  } as Record<string, unknown>;
  if (target.commit === "toggle") {
    return Object.fromEntries(
      Object.entries(options).filter(([key]) => !TOGGLE_TEXT_OPTIONS.has(key)),
    );
  }
  // A required select is not emptied by picking its value again.
  if (target.opensPicker === "defaultOpen") {
    return {
      ...options,
      deselectable: !target.field.required,
      defaultOpen: true,
    };
  }
  return options;
});
const invalidProps = computed(() =>
  isInvalid.value ? { color: "error", highlight: true } : {},
);

const draft = computed({
  get: () => props.inlineEdit.draft.value,
  set: (value: unknown) => props.inlineEdit.setDraft(value),
});

const editor = useTemplateRef<HTMLElement>("editor");
const display = useTemplateRef<HTMLElement>("display");
// Enter and Esc leave the keyboard on the cell they closed.
let shouldRefocusDisplay = false;

const commit = () => props.inlineEdit.commit(row.value, columnId.value);

// A select opens by itself (`defaultOpen`), focus in its list; a date's
// trigger is clicked open on arrival, not when focus comes back to it.
const focusControl = (shouldOpenPicker: boolean) => {
  const root = editor.value;
  const target = column.value;
  if (!root || !target) return;
  if (shouldOpenPicker && target.opensPicker === "defaultOpen") return;
  const focusable = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  focusable?.focus();
  if (shouldOpenPicker && target.opensPicker === "click") focusable?.click();
};

const open = (event?: Event) => {
  const target = event?.target as Element | null;
  if (target?.closest?.(DISPLAY_CONTROL_SELECTOR)) return;
  if (props.inlineEdit.start(row.value, columnId.value)) {
    void nextTick(() => focusControl(true));
  }
};

const isWithinCell = (element: Element | null): boolean =>
  !!element &&
  (!!editor.value?.contains(element) || !!element.closest(POPOVER_SELECTOR));

// The control settles its value on its own blur (a time is parsed then):
// the save waits for it.
const handleFocusOut = (event: FocusEvent) => {
  if (isWithinCell(event.relatedTarget as Element | null)) return;
  setTimeout(() => void commit(), 0);
};

const handleEditorKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    shouldRefocusDisplay = true;
    props.inlineEdit.cancel();
    return;
  }
  if (event.key !== "Enter" || column.value?.commit !== "type") return;
  event.preventDefault();
  shouldRefocusDisplay = true;
  // Leaving the control settles its value, and the focus-out saves it.
  (event.target as HTMLElement | null)?.blur?.();
};

// A pick is the edit: it saves at once.
const handleUpdate = (value: unknown) => {
  draft.value = value;
  if (column.value?.commit === "pick") void commit();
};

// A picker closed by a click elsewhere leaves no focus in the cell to lose:
// the click saves it too. Listened to while the cell is open only, rather
// than by every editable cell of the page.
let stopClickOutside: (() => void) | undefined;
watch(
  editor,
  (element) => {
    stopClickOutside?.();
    stopClickOutside = element
      ? onClickOutside(element, () => void commit(), {
          ignore: [POPOVER_SELECTOR],
        })
      : undefined;
  },
  { flush: "post" },
);
onBeforeUnmount(() => stopClickOutside?.());

// A refused value takes the keyboard back to its input.
watch(isInvalid, (invalid) => {
  if (invalid && isEditing.value) void nextTick(() => focusControl(false));
});

watch(isEditing, (editing, wasEditing) => {
  if (editing || !wasEditing || !shouldRefocusDisplay) return;
  shouldRefocusDisplay = false;
  void nextTick(() => display.value?.focus());
});

const toggle = (value: unknown) =>
  props.inlineEdit.toggle(row.value, columnId.value, value);
</script>

<template>
  <div v-if="!column || !control || !isEditable" :class="textClass">
    <FlexRender :render="cell.column.columnDef.cell" :props="cell" />
  </div>

  <!-- A switch or a checkbox saves as it toggles: no edit state. -->
  <div
    v-else-if="column.commit === 'toggle'"
    class="flex items-center gap-1.5"
    @click.stop
    @dblclick.stop
  >
    <label :for="inputId" class="sr-only">{{ inputLabel }}</label>
    <component
      :is="control"
      :id="inputId"
      :model-value="inlineEdit.valueOf(row, columnId) === true"
      size="sm"
      :disabled="isSaving"
      v-bind="controlOptions"
      @update:model-value="toggle"
    />
    <UIcon
      v-if="isSaving"
      name="i-ph-spinner"
      class="text-dimmed size-3.5 animate-spin"
      :aria-label="t('dms.table.inline_edit.saving')"
    />
  </div>

  <div
    v-else-if="isEditing"
    ref="editor"
    class="-mx-1.5 flex min-w-0 items-center gap-1.5"
    @click.stop
    @dblclick.stop
    @keydown="handleEditorKeydown"
    @focusout="handleFocusOut"
  >
    <label :for="inputId" class="sr-only">{{ inputLabel }}</label>
    <component
      :is="control"
      :id="inputId"
      :model-value="draft"
      size="sm"
      class="min-w-0 flex-1"
      :disabled="isSaving"
      :aria-invalid="isInvalid || undefined"
      v-bind="{ ...controlOptions, ...invalidProps }"
      @update:model-value="handleUpdate"
    />
    <UIcon
      v-if="isSaving"
      name="i-ph-spinner"
      class="text-dimmed size-3.5 shrink-0 animate-spin"
      :aria-label="t('dms.table.inline_edit.saving')"
    />
  </div>

  <!-- The value as the column draws it; a click turns it into the input. -->
  <div
    v-else
    ref="display"
    role="button"
    tabindex="0"
    :aria-label="t('dms.table.inline_edit.start', { cell: inputLabel })"
    :title="t('dms.table.inline_edit.hint')"
    class="hover:bg-elevated hover:ring-accented focus-visible:ring-primary -mx-1.5 flex min-h-7 cursor-text items-center gap-1.5 rounded-md px-1.5 outline-none hover:ring-1 hover:ring-inset focus-visible:ring-2"
    @click.stop="open"
    @dblclick.stop
    @keydown.enter.prevent="open()"
    @keydown.f2.prevent="open()"
  >
    <div :class="['min-w-0 flex-1', textClass]">
      <FlexRender :render="cell.column.columnDef.cell" :props="cell" />
    </div>
    <UIcon
      v-if="isSaving"
      name="i-ph-spinner"
      class="text-dimmed size-3.5 shrink-0 animate-spin"
      :aria-label="t('dms.table.inline_edit.saving')"
    />
  </div>
</template>
