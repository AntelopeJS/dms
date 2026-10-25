<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { onClickOutside } from "@vueuse/core";
import type { MatrixColumn, MatrixEnterMove } from "../../../types/matrix";
import type { MatrixCommitMove } from "../../composables/matrix/useMatrixInteraction";
import {
  editorModelOf,
  isUnchangedModel,
  kindOf,
  valueFromEditorModel,
} from "../../composables/matrix/matrixValues";
import { useMatrixInvalidText } from "../../composables/matrix/useMatrixInvalidText";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import MatrixFieldInput from "./MatrixFieldInput.vue";

/**
 * A cell edited in place: the DMS input of its kind over the cell. Enter
 * saves and moves (`enterMove`), Shift+Enter breaks a long text's line,
 * Ctrl+Enter saves and stays, Tab / Shift+Tab save and edit the next or
 * previous editable cell, Escape cancels, Ctrl+Shift+Enter carries the draft
 * to the cell's drawer. A click elsewhere saves; a draft the column refuses
 * says why under the cell and is dropped by a click elsewhere. The cell's
 * reference text (its placeholder: the base text, the inherited one) shows
 * above the input while it is typed.
 */
interface MatrixCellEditorProps {
  column: MatrixColumn;
  /** The value the cell shows. */
  value: unknown;
  /** A typed first character, replacing the value. */
  draft?: unknown;
  hasDraft?: boolean;
  /** Labels the input: "Row · Column". */
  label: string;
  /** Shown above the input, as a reference (the cell's placeholder). */
  reference?: string;
  enterMove: MatrixEnterMove;
}

const props = withDefaults(defineProps<MatrixCellEditorProps>(), {
  draft: undefined,
  hasDraft: false,
  reference: undefined,
});

const emit = defineEmits<{
  commit: [value: unknown, move: MatrixCommitMove];
  cancel: [];
  openPanel: [model: unknown];
}>();

const FOCUSABLE = "input, textarea, [contenteditable='true'], button";
const FOCUS_ATTEMPTS = 20;
// Overlays an input opens (a select's list, a calendar) are not "elsewhere".
const OVERLAYS = [
  "[data-reka-popper-content-wrapper]",
  "[role='listbox']",
  "[role='dialog']",
];
/** Kinds whose own input takes a plain Enter (a tag added, a list opened). */
const ENTER_OWNING_KINDS = new Set(["tags", "select", "date"]);
/** Kinds saved as soon as a value is picked. */
const PICKED_KINDS = new Set(["select", "date"]);

const wrapper = useTemplateRef<HTMLElement>("wrapper");
const kind = computed(() => kindOf(props.column));
// A number started by typing keeps the characters as typed ("-", ".", ","):
// a number input would drop them. It is read as a number on commit.
const isTypedNumber = props.hasDraft && kindOf(props.column) === "number";
const model = ref<unknown>(
  isTypedNumber
    ? String(props.draft ?? "")
    : editorModelOf(props.column, props.hasDraft ? props.draft : props.value),
);
const invalidReason = ref<ReturnType<typeof valueFromEditorModel> | null>(null);
const isDone = ref(false);
const invalidText = useMatrixInvalidText();
const invalidMessage = computed(() =>
  invalidReason.value && !invalidReason.value.ok
    ? invalidText(props.column, invalidReason.value)
    : null,
);

function commit(move: MatrixCommitMove): boolean {
  if (isDone.value) return true;
  // Left as it opened, the cell keeps its stored value (a date and time its
  // seconds, which the input does not show).
  if (isUnchangedModel(props.column, model.value, props.value)) {
    isDone.value = true;
    emit("commit", props.value, move);
    return true;
  }
  const result = valueFromEditorModel(props.column, model.value);
  if (!result.ok) {
    invalidReason.value = result;
    return false;
  }
  isDone.value = true;
  emit("commit", result.value, move);
  return true;
}

function cancel(): void {
  if (isDone.value) return;
  isDone.value = true;
  emit("cancel");
}

function onModel(next: unknown): void {
  model.value = next;
  invalidReason.value = null;
  if (PICKED_KINDS.has(kind.value)) commit("stay");
}

type KeyAction = (event: KeyboardEvent) => (() => void) | undefined;

const enterAction: KeyAction = (event) => {
  const hasCommand = event.ctrlKey || event.metaKey;
  if (hasCommand && event.shiftKey)
    return () => {
      isDone.value = true;
      emit("openPanel", model.value);
    };
  if (hasCommand) return () => void commit("stay");
  if (event.altKey || event.defaultPrevented) return undefined;
  if (event.shiftKey && kind.value === "longText") return undefined;
  if (ENTER_OWNING_KINDS.has(kind.value)) return undefined;
  return () => void commit(props.enterMove);
};

const KEY_ACTIONS: Record<string, KeyAction> = {
  Escape: () => cancel,
  Enter: enterAction,
  Tab: (event) => () => void commit(event.shiftKey ? "previous" : "next"),
};

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  const action = KEY_ACTIONS[event.key]?.(event);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  action();
}

onClickOutside(
  wrapper,
  () => {
    if (!commit("stay")) cancel();
  },
  { ignore: OVERLAYS },
);

// The input is a lazily loaded component: it is focused once it is there,
// the caret after a typed character, the whole value selected otherwise.
function focusInput(attempt = 0): void {
  const element = wrapper.value?.querySelector<HTMLElement>(FOCUSABLE);
  if (!element) {
    if (attempt < FOCUS_ATTEMPTS)
      requestAnimationFrame(() => focusInput(attempt + 1));
    return;
  }
  element.focus();
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  )
    placeCaret(element);
  if (kind.value === "date") element.click();
}

function placeCaret(element: HTMLInputElement | HTMLTextAreaElement): void {
  if (props.hasDraft) {
    const end = element.value.length;
    element.setSelectionRange?.(end, end);
    return;
  }
  element.select?.();
}

onMounted(() => focusInput());

// Ctrl+S saves the grid with the cell being typed in.
const unregister = useMatrixContext().interaction.registerEditor(() => {
  if (!commit("stay")) cancel();
});
onBeforeUnmount(unregister);
</script>

<template>
  <div
    ref="wrapper"
    class="relative z-20 w-full"
    data-matrix-editor
    :aria-label="props.label"
    @keydown="onKeydown"
    @click.stop
    @dblclick.stop
  >
    <p
      v-if="props.reference"
      class="text-dimmed line-clamp-2 px-1 pt-1 pb-0.5 text-[11.5px] whitespace-normal"
      :title="props.reference"
    >
      {{ props.reference }}
    </p>
    <MatrixFieldInput
      :column="props.column"
      :model-value="model"
      :as-text="isTypedNumber"
      surface="cell"
      :invalid="Boolean(invalidMessage)"
      :default-open="kind === 'select' || undefined"
      @update:model-value="onModel"
    />
    <span
      v-if="invalidMessage"
      role="alert"
      class="bg-error text-inverted absolute start-0 top-full z-30 mt-1 rounded-md px-2 py-1 text-[11.5px] whitespace-nowrap shadow-md"
    >
      {{ invalidMessage }}
    </span>
  </div>
</template>
