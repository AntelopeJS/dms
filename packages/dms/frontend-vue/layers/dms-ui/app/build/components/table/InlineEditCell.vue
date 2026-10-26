<script setup lang="ts" generic="T extends Data">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  useId,
  useTemplateRef,
  watch,
} from "vue";
import { onClickOutside, useEventListener } from "@vueuse/core";
import { FlexRender, type CellContext } from "@tanstack/vue-table";
import type { Data } from "../../../types/table";
import type { TableInlineEdit } from "../../composables/table-view/useTableInlineEdit";
import { processFieldI18n } from "../../utils/fieldOptionsI18n";
import { whenFocusable } from "../../utils/whenFocusable";

interface InlineEditCellProps {
  /** The cell, as the grid hands it to a `<column>-cell` slot. */
  cell: CellContext<T, unknown>;
  inlineEdit: TableInlineEdit<T>;
}

/** What the cell reads of its grid column's definition. */
interface InlineEditColumnDef {
  cellWrap?: boolean;
  meta?: { label?: string };
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
// The control is resolved lazily: its code may still be loading when the
// cell opens. Past this delay, the cell gives up taking the keyboard.
const FOCUS_WAIT_MS = 3_000;

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

// `inputs: "always"`: the cell is its input, typed into at once. Focusing
// it opens the edit, leaving it saves, as the editor of a clicked cell.
const isAlwaysInput = computed(() => props.inlineEdit.inputs === "always");

const columnDef = computed(
  () => props.cell.column.columnDef as InlineEditColumnDef,
);
const textClass = computed(() =>
  columnDef.value.cellWrap
    ? "line-clamp-none whitespace-normal [overflow-wrap:anywhere]"
    : "line-clamp-1 text-ellipsis",
);

// While its value is being saved, the cell draws that value, not the old one.
const shownCell = computed<CellContext<T, unknown>>(() => {
  const saving = props.inlineEdit.pendingOf(row.value, columnId.value);
  const target = column.value;
  if (!saving || !target) return props.cell;
  const original = { ...row.value, [target.field.id]: saving.value } as T;
  return { ...props.cell, row: { ...props.cell.row, original } };
});

const inputId = useId();
const inputLabel = computed(() =>
  t("dms.table.inline_edit.cell", {
    column: columnDef.value.meta?.label ?? columnId.value,
    row: props.inlineEdit.rowLabel(row.value),
  }),
);
const status = computed(() =>
  isSaving.value ? t("dms.table.inline_edit.saving") : "",
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
  // Picking the value a cell holds again keeps it: a cell is emptied by
  // clearing it, not by a click on its own value.
  // Drawn as inputs, every select of the grid would open at once.
  if (target.opensPicker === "defaultOpen" && !isAlwaysInput.value) {
    return { ...options, deselectable: false, defaultOpen: true };
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
const field = useTemplateRef<HTMLElement>("field");

const inputValue = computed(() =>
  isEditing.value
    ? draft.value
    : props.inlineEdit.valueOf(row.value, columnId.value),
);
const openOnFocus = () => {
  if (!isEditing.value) props.inlineEdit.start(row.value, columnId.value);
};
// Enter and Esc leave the keyboard on the cell they closed.
let shouldRefocusDisplay = false;

const commit = () => props.inlineEdit.commit(row.value, columnId.value);

// A select opens by itself (`defaultOpen`), the keyboard in its list; a
// date's trigger is clicked open on arrival, not when focus comes back to
// it; a text or a number is selected whole, ready to be typed over.
const focusControl = async (shouldOpenPicker: boolean) => {
  const target = column.value;
  if (!editor.value || !target) return;
  if (shouldOpenPicker && target.opensPicker === "defaultOpen") return;
  const focusable = await whenFocusable(
    editor.value,
    FOCUSABLE_SELECTOR,
    FOCUS_WAIT_MS,
  );
  if (!focusable || !isEditing.value) return;
  focusable.focus();
  if (focusable instanceof HTMLInputElement) focusable.select();
  if (shouldOpenPicker && target.opensPicker === "click") focusable.click();
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
  (!!(editor.value ?? field.value)?.contains(element) ||
    !!element.closest(POPOVER_SELECTOR));

// The control settles its value on its own blur (a time is parsed then):
// the save waits for it.
const handleFocusOut = (event: FocusEvent) => {
  if (isWithinCell(event.relatedTarget as Element | null)) return;
  setTimeout(() => void commit(), 0);
};

const cancel = () => {
  shouldRefocusDisplay = true;
  props.inlineEdit.cancel();
};

const handleEditorKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    cancel();
    return;
  }
  if (event.key !== "Enter" || column.value?.commit !== "type") return;
  event.preventDefault();
  shouldRefocusDisplay = true;
  // Leaving the control settles its value, and the focus-out saves it.
  (event.target as HTMLElement | null)?.blur?.();
};

// Esc in an open picker closes the picker and the cell at once.
const handlePickerEscape = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  const target = event.target as Element | null;
  if (target?.closest?.(POPOVER_SELECTOR)) cancel();
};

// A pick is the edit: it saves at once.
const handleUpdate = (value: unknown) => {
  draft.value = value;
  if (column.value?.commit !== "pick") return;
  // The picker closed: the keyboard goes back to the cell, not to the page.
  shouldRefocusDisplay = true;
  void commit();
};

// A value typed into an input drawn at rest opens its cell's edit first.
const handleInput = (value: unknown) => {
  openOnFocus();
  handleUpdate(value);
};

// A picker closed by a click elsewhere leaves no focus in the cell to lose:
// the click saves it too. Listened to while the cell is open only, rather
// than by every editable cell of the page.
let stopListening: (() => void) | undefined;
watch(
  editor,
  (element) => {
    stopListening?.();
    stopListening = undefined;
    if (!element) return;
    const stops = [
      onClickOutside(element, () => void commit(), {
        ignore: [POPOVER_SELECTOR],
      }),
      useEventListener(document, "keydown", handlePickerEscape, {
        capture: true,
      }),
    ];
    stopListening = () => stops.forEach((stop) => stop());
  },
  { flush: "post" },
);
onBeforeUnmount(() => stopListening?.());

// A refused value takes the keyboard back to its input, when the user is
// still on it (a refusal never pulls them back from another cell).
watch(isInvalid, (invalid) => {
  if (invalid && isEditing.value) void nextTick(() => focusControl(false));
});

// Whether the keyboard is still this cell's: on it, or on nothing (the
// closed editor took it along). Gone to another cell, it stays there.
const isKeyboardHere = (element: HTMLElement): boolean => {
  const focused = document.activeElement;
  if (!focused || focused === document.body) return true;
  return !!element.parentElement?.contains(focused);
};

// Drawn as an input, the cell takes the keyboard back in that input.
const refocusTarget = (): HTMLElement | null | undefined =>
  isAlwaysInput.value
    ? field.value?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    : display.value;

watch(isEditing, (editing, wasEditing) => {
  if (editing || !wasEditing || !shouldRefocusDisplay) return;
  shouldRefocusDisplay = false;
  void nextTick(() => {
    const element = refocusTarget();
    if (element && isKeyboardHere(element)) element.focus();
  });
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
    :aria-busy="isSaving || undefined"
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
      role="img"
      :aria-label="t('dms.table.inline_edit.saving')"
    />
    <span class="sr-only" role="status">{{ status }}</span>
  </div>

  <!-- inputs: "always": the input at rest, opened as it takes the focus. -->
  <div
    v-else-if="isAlwaysInput"
    ref="field"
    class="-mx-1.5 flex min-w-0 items-center gap-1.5"
    data-inline-edit="input"
    :aria-busy="isSaving || undefined"
    @click.stop
    @dblclick.stop
    @focusin="openOnFocus"
    @keydown="handleEditorKeydown"
    @focusout="handleFocusOut"
  >
    <label :for="inputId" class="sr-only">{{ inputLabel }}</label>
    <component
      :is="control"
      :id="inputId"
      :model-value="inputValue"
      size="sm"
      class="min-w-0 flex-1"
      :disabled="isSaving"
      :aria-invalid="isInvalid || undefined"
      v-bind="{ ...controlOptions, ...invalidProps }"
      @update:model-value="handleInput"
    />
    <UIcon
      v-if="isSaving"
      name="i-ph-spinner"
      class="text-dimmed size-3.5 shrink-0 animate-spin"
      role="img"
      :aria-label="t('dms.table.inline_edit.saving')"
    />
    <span class="sr-only" role="status">{{ status }}</span>
  </div>

  <div
    v-else-if="isEditing"
    ref="editor"
    class="-mx-1.5 flex min-w-0 items-center gap-1.5"
    data-inline-edit="editor"
    :aria-busy="isSaving || undefined"
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
      role="img"
      :aria-label="t('dms.table.inline_edit.saving')"
    />
    <span class="sr-only" role="status">{{ status }}</span>
  </div>

  <!-- The value as the column draws it; a click turns it into the input. A
       value the server refused marks the cell until it is edited again. -->
  <div
    v-else
    ref="display"
    role="button"
    tabindex="0"
    data-inline-edit="display"
    :aria-label="t('dms.table.inline_edit.start', { cell: inputLabel })"
    :aria-busy="isSaving || undefined"
    :title="
      isInvalid
        ? t('dms.table.inline_edit.not_saved')
        : t('dms.table.inline_edit.hint')
    "
    :class="[
      'hover:bg-elevated hover:ring-accented focus-visible:ring-primary -mx-1.5 flex min-h-7 cursor-text items-center gap-1.5 rounded-md px-1.5 outline-none hover:ring-1 hover:ring-inset focus-visible:ring-2',
      isInvalid && 'ring-error ring-1 ring-inset',
    ]"
    @click.stop="open"
    @dblclick.stop
    @keydown.enter.prevent="open()"
    @keydown.f2.prevent="open()"
  >
    <div :class="['min-w-0 flex-1', textClass]">
      <FlexRender :render="cell.column.columnDef.cell" :props="shownCell" />
    </div>
    <UIcon
      v-if="isSaving"
      name="i-ph-spinner"
      class="text-dimmed size-3.5 shrink-0 animate-spin"
      role="img"
      :aria-label="t('dms.table.inline_edit.saving')"
    />
    <UIcon
      v-else-if="isInvalid"
      name="i-ph-warning-circle"
      class="text-error size-3.5 shrink-0"
      role="img"
      :aria-label="t('dms.table.inline_edit.not_saved')"
    />
    <!-- A save after Enter runs here, the editor closed: still announced. -->
    <span class="sr-only" role="status">{{ status }}</span>
  </div>
</template>
