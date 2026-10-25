<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { MatrixContext } from "../../composables/matrix/useMatrix";
import {
  editorModelOf,
  isEmptyValue,
  isSameValue,
  kindOf,
  valueFromEditorModel,
  valueText,
  type EditorValueResult,
} from "../../composables/matrix/matrixValues";
import { useMatrixInvalidText } from "../../composables/matrix/useMatrixInvalidText";
import MatrixFieldInput from "./MatrixFieldInput.vue";

/**
 * The drawer of one cell (a JSON value, a long text): its editor alone, the
 * column as its title and the row as its description. Staged, Apply puts
 * the value in the grid's edits; immediate, the value is saved as it is
 * typed, once it holds still. A nullable column offers "Set to null".
 */
interface MatrixCellDrawerProps {
  context: MatrixContext;
  rowId: string;
  columnId: string;
  /** The draft the drawer opens with: a typed character, an inline draft. */
  draft?: unknown;
  hasDraft?: boolean;
  /** `draft` is already an editor model (the inline editor's). */
  isModel?: boolean;
}

const props = withDefaults(defineProps<MatrixCellDrawerProps>(), {
  draft: undefined,
  hasDraft: false,
  isModel: false,
});

const emit = defineEmits<{ success: [] }>();

const { t } = useI18n();
const invalidText = useMatrixInvalidText();
const AUTOSAVE_DELAY_MS = 700;
const FIELD_ID = "dms-matrix-cell-field";

const matrix = props.context;
const row = computed(() => matrix.rows.rowById.value.get(props.rowId));
const column = computed(() =>
  matrix.columns.columnById.value.get(props.columnId),
);
const stored = computed(() =>
  row.value ? matrix.valueOf(row.value, props.columnId) : undefined,
);
const isReadOnly = computed(
  () =>
    !row.value || !column.value || !matrix.isEditable(row.value, column.value),
);
const isImmediate = computed(
  () => (matrix.options.saveMode ?? "immediate") === "immediate",
);
const saveState = computed(() =>
  matrix.engine.stateOf(props.rowId, props.columnId),
);
const edit = computed(() => matrix.engine.editOf(props.rowId, props.columnId));
/** What the save status says of an autosaved cell; nothing while idle. */
const STATUS_STATES: Partial<Record<string, "saving" | "saved" | "error">> = {
  saving: "saving",
  saved: "saved",
  error: "error",
  conflict: "error",
};
const statusState = computed(() => STATUS_STATES[saveState.value]);

function initialModel(): unknown {
  if (!column.value) return null;
  if (props.hasDraft && props.isModel) return props.draft;
  return editorModelOf(
    column.value,
    props.hasDraft ? props.draft : stored.value,
  );
}

const model = ref<unknown>(initialModel());
const result = computed<EditorValueResult | null>(() =>
  column.value ? valueFromEditorModel(column.value, model.value) : null,
);
const errorText = computed(() =>
  result.value && !result.value.ok && column.value
    ? invalidText(column.value, result.value)
    : null,
);
const isChanged = computed(
  () => !!result.value?.ok && !isSameValue(result.value.value, stored.value),
);
const issues = computed(() =>
  row.value
    ? (matrix.cellState(row.value, props.columnId).issues ?? []).map(
        matrix.text,
      )
    : [],
);
const wasText = computed(() => {
  const current = edit.value;
  if (!current || current.conflict) return null;
  return isEmptyValue(current.before)
    ? t("dms.matrix.empty_value")
    : valueText(current.before);
});
const failure = computed(() =>
  edit.value?.status === "failed" && edit.value.message
    ? matrix.text(edit.value.message)
    : null,
);

/** Puts a value in the grid: staged, or written now. */
function apply(value: unknown): void {
  if (!row.value || !column.value) return;
  matrix.commitValue(row.value, column.value, value);
}

function applyModel(): boolean {
  const read = result.value;
  if (!read?.ok) return false;
  if (isChanged.value) apply(read.value);
  return true;
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(model, () => {
  if (!isImmediate.value || isReadOnly.value) return;
  clearTimeout(timer);
  timer = setTimeout(applyModel, AUTOSAVE_DELAY_MS);
});
onBeforeUnmount(() => clearTimeout(timer));

function save(): void {
  clearTimeout(timer);
  if (applyModel()) emit("success");
}

function setNull(): void {
  if (!column.value) return;
  clearTimeout(timer);
  model.value = editorModelOf(column.value, null);
  apply(null);
  if (!isImmediate.value) emit("success");
}

const isFill = computed(() =>
  column.value ? ["json", "code"].includes(kindOf(column.value)) : false,
);
</script>

<template>
  <div v-if="column && row" class="flex w-full min-w-0 flex-1 flex-col gap-4">
    <div class="flex flex-1 flex-col gap-2">
      <DmsFieldRow
        layout="stack"
        :fill="isFill"
        :inset="false"
        spacing="list"
        :label="context.text(column.label)"
        :label-for="FIELD_ID"
        :description="
          column.description ? context.text(column.description) : undefined
        "
        :required="column.required"
      >
        <MatrixFieldInput
          :id="FIELD_ID"
          v-model="model"
          :column="column"
          :disabled="isReadOnly"
          :invalid="Boolean(errorText)"
          :fill="isFill || undefined"
        />
      </DmsFieldRow>
      <p v-if="errorText" class="text-error text-[12.5px]" role="alert">
        {{ errorText }}
      </p>
      <p v-if="wasText !== null" class="text-dimmed text-xs">
        {{ t("dms.matrix.was", { value: wasText }) }}
      </p>
      <ul v-if="issues.length" class="space-y-0.5">
        <li
          v-for="issue in issues"
          :key="issue"
          class="text-warning flex items-start gap-1 text-xs"
        >
          <UIcon name="i-ph-warning" class="mt-px size-3.5 shrink-0" />
          {{ issue }}
        </li>
      </ul>
      <p
        v-if="failure"
        class="text-error flex items-start gap-1 text-xs"
        role="alert"
      >
        <UIcon name="i-ph-warning-circle" class="mt-px size-3.5 shrink-0" />
        {{ failure }}
      </p>
    </div>

    <DmsContainerFooter justify="between">
      <span class="flex items-center gap-2">
        <UButton
          v-if="column.nullable && !isReadOnly"
          variant="ghost"
          color="neutral"
          size="lg"
          :label="t('dms.matrix.set_null')"
          @click="setNull"
        />
        <DmsSaveStatus
          v-if="isImmediate && statusState"
          :state="statusState"
          @retry="context.engine.retry(rowId, columnId)"
        />
      </span>
      <span class="flex items-center gap-2">
        <template v-if="isReadOnly || isImmediate">
          <UButton
            size="lg"
            :variant="isReadOnly ? 'outline' : 'solid'"
            :color="isReadOnly ? 'neutral' : 'primary'"
            :label="t('dms.matrix.drawer.done')"
            :disabled="!isReadOnly && Boolean(errorText)"
            @click="isReadOnly ? emit('success') : save()"
          />
        </template>
        <template v-else>
          <UButton
            variant="outline"
            color="neutral"
            size="lg"
            :label="t('dms.matrix.drawer.cancel')"
            @click="emit('success')"
          />
          <UButton
            size="lg"
            :label="t('dms.matrix.drawer.apply')"
            :disabled="Boolean(errorText)"
            @click="save"
          />
        </template>
      </span>
    </DmsContainerFooter>
  </div>
</template>
