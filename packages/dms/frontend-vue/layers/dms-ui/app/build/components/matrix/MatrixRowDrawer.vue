<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import type { MatrixColumn } from "../../../types/matrix";
import type { MatrixContext } from "../../composables/matrix/useMatrix";
import {
  editorModelOf,
  isEmptyValue,
  isSameValue,
  kindOf,
  valueFromEditorModel,
  valueText,
} from "../../composables/matrix/matrixValues";
import { useMatrixInvalidText } from "../../composables/matrix/useMatrixInvalidText";
import MatrixFieldInput from "./MatrixFieldInput.vue";

/**
 * A whole row in a drawer: one DMS input per column, in a vertical form
 * (read-only ones disabled), its edits going through the grid's save mode
 * like a cell's: a pick at once, a typed value once its field is left. A
 * staged field says what it was; a nullable one offers "Set to null". With
 * `showJson`, a tab shows the row as JSON. J and K step through the rows.
 */
interface MatrixRowDrawerProps {
  context: MatrixContext;
  rowId: string;
}

const props = defineProps<MatrixRowDrawerProps>();
const emit = defineEmits<{ success: [] }>();

const { t } = useI18n();
const invalidText = useMatrixInvalidText();
const PICKED_KINDS = new Set(["boolean", "select", "date", "tags"]);
const JSON_INDENT = 2;

type DrawerTab = "fields" | "json";

const matrix = props.context;
const row = computed(() => matrix.rows.rowById.value.get(props.rowId));
const columns = computed(() => matrix.columns.columns.value);
const showsJson = computed(
  () =>
    typeof matrix.options.rowPanel === "object" &&
    matrix.options.rowPanel.showJson === true,
);
const tab = ref<DrawerTab>("fields");
const tabs = computed(() => [
  { label: t("dms.matrix.drawer.fields"), value: "fields" },
  { label: t("dms.matrix.drawer.json"), value: "json" },
]);

/** The fields typed into and not committed yet, by column id. */
const drafts = reactive<Record<string, unknown>>({});
const errors = reactive<Record<string, string>>({});

const storedOf = (column: MatrixColumn) =>
  row.value ? matrix.valueOf(row.value, column.id) : undefined;
const modelOf = (column: MatrixColumn) =>
  column.id in drafts
    ? drafts[column.id]
    : editorModelOf(column, storedOf(column));
const isReadOnly = (column: MatrixColumn) =>
  !row.value || !matrix.isEditable(row.value, column);
const fieldId = (column: MatrixColumn) => `dms-matrix-row-${column.id}`;

function wasOf(column: MatrixColumn): string | null {
  const edit = matrix.engine.editOf(props.rowId, column.id);
  if (!edit || edit.conflict) return null;
  return isEmptyValue(edit.before)
    ? t("dms.matrix.empty_value")
    : valueText(edit.before);
}

function failureOf(column: MatrixColumn): string | null {
  const edit = matrix.engine.editOf(props.rowId, column.id);
  return edit?.status === "failed" && edit.message
    ? matrix.text(edit.message)
    : null;
}

function issuesOf(column: MatrixColumn): string[] {
  if (!row.value) return [];
  return (matrix.cellState(row.value, column.id).issues ?? []).map(matrix.text);
}

function commit(column: MatrixColumn): void {
  if (!(column.id in drafts) || !row.value) return;
  const read = valueFromEditorModel(column, drafts[column.id]);
  if (!read.ok) {
    errors[column.id] = invalidText(column, read);
    return;
  }
  Reflect.deleteProperty(drafts, column.id);
  Reflect.deleteProperty(errors, column.id);
  if (!isSameValue(read.value, storedOf(column)))
    matrix.commitValue(row.value, column, read.value);
}

/** A field left (not a move inside it, a stepper, a popover): its draft goes. */
function onFocusOut(column: MatrixColumn, event: FocusEvent): void {
  const field = event.currentTarget as HTMLElement | null;
  const next = event.relatedTarget as Node | null;
  if (field && next && field.contains(next)) return;
  commit(column);
}

function onModel(column: MatrixColumn, model: unknown): void {
  drafts[column.id] = model;
  Reflect.deleteProperty(errors, column.id);
  if (PICKED_KINDS.has(kindOf(column))) commit(column);
}

function setNull(column: MatrixColumn): void {
  if (!row.value) return;
  Reflect.deleteProperty(drafts, column.id);
  Reflect.deleteProperty(errors, column.id);
  matrix.commitValue(row.value, column, null);
}

function commitAll(): void {
  for (const column of columns.value) commit(column);
}

// Stepping to another row (J / K) or closing keeps what was typed.
onBeforeUnmount(commitAll);

const json = computed(() => {
  if (!row.value) return "";
  const values = Object.fromEntries(
    columns.value.map((column) => [column.id, storedOf(column)]),
  );
  return JSON.stringify({ id: row.value.id, ...values }, null, JSON_INDENT);
});

const isStaged = computed(() => matrix.options.saveMode === "staged");
const stagedCount = computed(() => matrix.engine.count.value);

function saveAll(): void {
  commitAll();
  void matrix.requestSave();
}
</script>

<template>
  <div v-if="row" class="flex w-full min-w-0 flex-1 flex-col gap-4">
    <DmsSegmented
      v-if="showsJson"
      v-model="tab"
      :items="tabs"
      size="sm"
      class="self-start"
    />
    <div v-if="tab === 'fields'" class="flex flex-col gap-4">
      <div
        v-for="column in columns"
        :key="column.id"
        class="flex flex-col gap-1"
        @focusout="onFocusOut(column, $event)"
      >
        <DmsFieldRow
          layout="stack"
          :inset="false"
          spacing="list"
          :label="context.text(column.label)"
          :label-for="fieldId(column)"
          :description="
            column.description ? context.text(column.description) : undefined
          "
          :required="column.required"
          :disabled="isReadOnly(column)"
        >
          <MatrixFieldInput
            :id="fieldId(column)"
            :column="column"
            :model-value="modelOf(column)"
            :disabled="isReadOnly(column)"
            :invalid="Boolean(errors[column.id])"
            @update:model-value="onModel(column, $event)"
          />
        </DmsFieldRow>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p v-if="errors[column.id]" class="text-error text-xs" role="alert">
            {{ errors[column.id] }}
          </p>
          <p v-if="wasOf(column) !== null" class="text-dimmed text-xs">
            {{ t("dms.matrix.was", { value: wasOf(column) }) }}
          </p>
          <p v-if="failureOf(column)" class="text-error text-xs" role="alert">
            {{ failureOf(column) }}
          </p>
          <span
            v-for="issue in issuesOf(column)"
            :key="issue"
            class="text-warning flex items-center gap-1 text-xs"
          >
            <UIcon name="i-ph-warning" class="size-3.5" />
            {{ issue }}
          </span>
          <UButton
            v-if="column.nullable && !isReadOnly(column)"
            size="xs"
            color="neutral"
            variant="ghost"
            class="ms-auto"
            :label="t('dms.matrix.set_null')"
            @click="setNull(column)"
          />
        </div>
      </div>
    </div>
    <DmsInputCode
      v-else
      :model-value="json"
      language="json"
      :min-lines="12"
      disabled
    />

    <DmsContainerFooter>
      <UButton
        variant="outline"
        color="neutral"
        size="lg"
        :label="t('dms.matrix.drawer.done')"
        @click="emit('success')"
      />
      <UButton
        v-if="isStaged && stagedCount > 0"
        size="lg"
        :label="t('dms.matrix.save_label', { count: stagedCount }, stagedCount)"
        :disabled="context.isBlocked.value"
        @click="saveAll"
      />
    </DmsContainerFooter>
  </div>
</template>
