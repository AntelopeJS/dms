<script setup lang="ts">
import { isVNode, type VNodeChild } from "vue";
import type { FormField } from "../../../composables/form/types/field";
import {
  isEmptyFormValue,
  sameFormValue,
} from "../../composables/unsaved-changes/formValue";
import { FORM_ENTRY_CONTEXT_KEY } from "../../composables/form/formEntryContext";

interface FormFieldNotesProps {
  field: FormField;
}

const props = defineProps<FormFieldNotesProps>();
const context = inject(FORM_ENTRY_CONTEXT_KEY)!;
const { t, locale } = useI18n();
const { getDataType } = useDataTypes();

const value = computed(() => context.state.value[props.field.id]);
const baseline = computed(() => context.baselineValue(props.field.id));
const defaultValue = computed(() => props.field.defaultValue);

// "Changed · was X" while a change waits for its save.
const showsChange = computed(
  () => context.showsChanges && context.isFieldChanged(props.field.id),
);
// "Module default · Use default" on a value that is not the default, for a
// field that offers it (a setting, not a record's initial value), unless the
// change line already says what it was.
const showsDefault = computed(
  () =>
    !!props.field.offersDefault &&
    defaultValue.value !== undefined &&
    !context.isFieldDisabled(props.field) &&
    !sameFormValue(value.value, defaultValue.value) &&
    !sameFormValue(baseline.value, defaultValue.value),
);

// Values that do not fit a line, or must not show: "Changed" alone.
const UNWORDED_TYPES = new Set(["password", "code", "rich_text"]);

/** A value as the field's type words it, or nothing when it cannot. */
function wordValue(raw: unknown): VNodeChild | undefined {
  if (UNWORDED_TYPES.has(props.field.type ?? "")) return undefined;
  const dataType = props.field.type ? getDataType(props.field.type) : undefined;
  if (dataType?.displayComponent && !dataType.formatter) return undefined;
  const formatter = dataType?.formatter?.default;
  if (formatter) {
    const worded = formatter(raw, locale.value, props.field.component.options);
    return isVNode(worded) || typeof worded === "string" ? worded : undefined;
  }
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  return undefined;
}

/**
 * The baseline as the form loaded it. A type keeping less in the form than
 * it reads (a relation keeps the ids of the rows the server joined) words
 * the loaded value, its label, while that is still the baseline.
 */
const loadedBaseline = computed(() => {
  const loaded = context.initialValues.value[props.field.id];
  const dataType = props.field.type ? getDataType(props.field.type) : undefined;
  if (!dataType?.beforeStateMapper || isEmptyFormValue(loaded)) {
    return baseline.value;
  }
  const options = props.field.component.options;
  const mapped = dataType.beforeStateMapper(loaded, options);
  const isSame = dataType.isSameValue
    ? dataType.isSameValue(mapped, baseline.value, options)
    : sameFormValue(mapped, baseline.value);
  return isSame ? loaded : baseline.value;
});

const wordedBaseline = computed(() => wordValue(loadedBaseline.value));

function useDefault(): void {
  context.state.value[props.field.id] = JSON.parse(
    JSON.stringify(defaultValue.value),
  );
}
</script>

<template>
  <div
    v-if="showsChange || showsDefault"
    class="grid min-w-0 gap-0.5 text-xs break-words"
  >
    <p
      v-if="showsChange"
      class="text-muted flex flex-wrap items-center gap-1.5"
    >
      <span class="bg-warning size-1.5 rounded-full" aria-hidden="true" />
      {{ t("dms.form.field_notes.changed") }}
      <template v-if="isEmptyFormValue(baseline)">
        · {{ t("dms.form.field_notes.was_empty") }}
      </template>
      <template v-else-if="wordedBaseline !== undefined">
        · {{ t("dms.form.field_notes.was") }}
        <span><component :is="() => wordedBaseline" /></span>
      </template>
    </p>
    <p
      v-if="showsDefault"
      class="text-muted flex flex-wrap items-center gap-1.5"
    >
      {{ t("dms.form.field_notes.default") }}
      <span><component :is="() => wordValue(defaultValue)" /></span>
      ·
      <UButton
        :label="t('dms.form.field_notes.use_default')"
        color="primary"
        variant="link"
        size="xs"
        class="p-0 text-start whitespace-normal"
        @click="useDefault"
      />
    </p>
  </div>
</template>
