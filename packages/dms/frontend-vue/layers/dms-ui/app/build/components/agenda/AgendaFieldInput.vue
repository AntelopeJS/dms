<script setup lang="ts">
import {
  isString,
  isNumber,
} from "../../../../../dms-core/app/utils/type-check";
import { computed, ref, useAttrs } from "vue";
import MatrixFieldInput from "../matrix/MatrixFieldInput.vue";
import AgendaRelationInput from "./AgendaRelationInput.vue";
import { resolveDmsComponent } from "../../../composables/resolveDmsComponent";
import {
  formText,
  matrixKindOf,
  type AgendaFormField,
  type AgendaFormValue,
} from "../../composables/agenda/agendaForm";
import {
  dayOfWallClock,
  hasEmptiedTime,
  hasUnreadTime,
  readClock,
  timeOfWallClock,
  wallClockIso,
  wallClockOf,
  withDay,
  withTime,
} from "../../composables/agenda/agendaFormTime";
import type { MatrixColumn, MatrixEditorModel } from "../../../types/matrix";
import { useComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";

/**
 * The input of a details form field: the start and end as a day (and a time
 * unless all-day), the resources as a multiple select, a `time` field as
 * the DMS time input, every other kind as the Matrix draws the same kind
 * (`MatrixFieldInput`: InputText, Textarea, InputNumber, Switch, Select...).
 */
interface AgendaFieldInputProps {
  field: AgendaFormField;
  modelValue: AgendaFormValue;
  id?: string;
  invalid?: boolean;
  /** The event is all-day: start and end show their day only. */
  allDay?: boolean;
  /** The agenda's zone: a `datetime` field is edited on its wall clock. */
  timeZone?: string;
}

const props = withDefaults(defineProps<AgendaFieldInputProps>(), {
  id: undefined,
  invalid: false,
  allDay: false,
  timeZone: "UTC",
});
const emit = defineEmits<{ "update:modelValue": [value: AgendaFormValue] }>();
const { t } = useI18n();
const { processText } = useComposedText();
const attrs = useAttrs();

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const TIME_KIND = "time";

const isMoment = computed(
  () => props.field.builtIn === "start" || props.field.builtIn === "end",
);
const isResources = computed(() => props.field.builtIn === "resourceIds");
/**
 * The resources unless the block marks them `multiple: false`, and a `select` field marked `multiple`:
 * a multiple select of the options. Resources marked `multiple: false` are one select whose value stays a list.
 */
const isMultiSelect = computed(
  () =>
    props.field.multiple === true &&
    (isResources.value || props.field.kind === "select"),
);
const isOneResource = computed(
  () => isResources.value && props.field.multiple !== true,
);
const picked = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue.filter(isString) : [],
);
const oneResource = computed(() => picked.value[0]);
const isTime = computed(() => props.field.kind === TIME_KIND);
const isRelation = computed(
  () => props.field.kind === "relation" && props.field.relation !== undefined,
);
const isDateTime = computed(
  () => !props.field.builtIn && props.field.kind === "datetime",
);
const WALL_CLOCK_LENGTH = 16;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;
/**
 * A stored value as the input shows it: an instant as the wall clock of the
 * agenda's zone; a value stored without an offset is already one.
 */
const dateTimeModel = computed(() => {
  const value = props.modelValue;
  if (!isString(value) || !value) return "";
  if (!HAS_OFFSET.test(value)) return value.slice(0, WALL_CLOCK_LENGTH);
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? "" : wallClockOf(epoch, props.timeZone);
});
const setDateTime = (value: MatrixEditorModel) => {
  const typed = isString(value) ? value.slice(0, WALL_CLOCK_LENGTH) : "";
  if (typed && typed === dateTimeModel.value) {
    emit("update:modelValue", props.modelValue);
    return;
  }
  emit(
    "update:modelValue",
    typed ? (wallClockIso(typed, props.timeZone) ?? typed) : null,
  );
};
const datePicker = resolveDmsComponent("dms-date-picker");
const timeInput = resolveDmsComponent("dms-input-time");

const column = computed<MatrixColumn>(() => ({
  id: props.field.id,
  label: props.field.label,
  kind: matrixKindOf(props.field.kind),
  options: props.field.options,
}));
const items = computed(() =>
  props.field.options.map((option) => ({
    label: processText(option.label),
    value: option.value,
    icon: option.icon,
  })),
);

const moment = computed(() => formText(props.modelValue));
const setDay = (day: string | null | undefined) => {
  if (isString(day) && day)
    emit("update:modelValue", withDay(moment.value, day.slice(0, 10)));
};
const setTime = (time: string) => {
  emit("update:modelValue", withTime(moment.value, time));
};

/**
 * The start or end time as typed, until it is read: a text field named in
 * the page's language, where a native
 * `type="time"` input is named in the browser's ("Heures", "Minutes") and a
 * Reka time field always in English ("hour", "minute").
 */
const typedClock = ref<string | null>(null);
const shownClock = computed(
  () => typedClock.value ?? timeOfWallClock(moment.value),
);
/**
 * Reads the typed time and gives the time the field then holds. A time of
 * day sets it; anything else is kept as typed, so the form refuses it on
 * this field instead of saving the time it had.
 */
const commitClock = (): string => {
  const typed = typedClock.value?.trim();
  typedClock.value = null;
  const kept = timeOfWallClock(moment.value);
  if (typed === undefined) return kept;
  const time = readClock(typed) ?? typed;
  if (time !== kept) setTime(time);
  return time;
};
/** Enter reads the time, and submits the form only once it is a time of day. */
const enterClock = (event: KeyboardEvent) => {
  if (readClock(commitClock()) === undefined) event.preventDefault();
};
/** The time held is not a time of day: flagged on the field before any save. */
const clockUnread = computed(
  () => isMoment.value && !props.allDay && hasUnreadTime(moment.value),
);
const clockEmptied = computed(() => hasEmptiedTime(moment.value));
const clockInvalid = computed(() => props.invalid || clockUnread.value);
const clockErrorId = computed(() => `${props.id ?? props.field.id}-time-error`);
/** The message the time field is described by: its own while only it sees the fault, else the form's. */
const clockDescribedBy = computed(() => {
  if (clockUnread.value && !props.invalid) return clockErrorId.value;
  const fromForm = attrs["aria-describedby"];
  return isString(fromForm) ? fromForm : undefined;
});
/** The time field's name in sentence case, one key per moment ("Heure de début", "Begintijd"). */
const clockLabel = computed(() =>
  t(
    props.field.builtIn === "end"
      ? "dms.agenda.form.end_time"
      : "dms.agenda.form.start_time",
  ),
);

/** A `time` field holds "HH:mm"; the DMS time input, milliseconds. */
const timeMs = computed(() => {
  const match = /^(\d{1,2}):(\d{2})/.exec(formText(props.modelValue));
  if (!match) return null;
  return (Number(match[1]) * MINUTES_PER_HOUR + Number(match[2])) * MINUTE_MS;
});
const setTimeMs = (value: number | null | undefined) => {
  if (!isNumber(value)) {
    emit("update:modelValue", undefined);
    return;
  }
  const minutes = Math.round(value / MINUTE_MS);
  const hours = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, "0");
  const rest = String(minutes % MINUTES_PER_HOUR).padStart(2, "0");
  emit("update:modelValue", `${hours}:${rest}`);
};
</script>

<template>
  <div v-if="isMoment" class="flex flex-wrap gap-2">
    <Component
      :is="datePicker"
      :id="props.id"
      class="min-w-36 flex-1"
      :model-value="dayOfWallClock(moment)"
      :disabled="props.field.readOnly"
      :color="props.invalid ? 'error' : undefined"
      :highlight="props.invalid || undefined"
      @update:model-value="setDay"
    />
    <UInput
      v-if="!props.allDay"
      class="w-24"
      inputmode="numeric"
      autocomplete="off"
      maxlength="5"
      :model-value="shownClock"
      :disabled="props.field.readOnly"
      :color="clockInvalid ? 'error' : undefined"
      :highlight="clockInvalid || undefined"
      :aria-invalid="clockInvalid ? 'true' : undefined"
      :aria-describedby="clockDescribedBy"
      :aria-label="clockLabel"
      @update:model-value="typedClock = String($event ?? '')"
      @blur="commitClock"
      @keydown.enter="enterClock"
    />
    <p
      v-if="clockUnread && !props.invalid"
      :id="clockErrorId"
      class="text-error w-full text-xs"
      role="alert"
    >
      {{
        t(
          clockEmptied
            ? "dms.agenda.form.time_required"
            : "dms.agenda.form.invalid_time",
        )
      }}
    </p>
  </div>
  <USelectMenu
    v-else-if="isMultiSelect"
    :id="props.id"
    :model-value="picked"
    :items="items"
    value-key="value"
    multiple
    class="w-full"
    :aria-label="processText(props.field.label)"
    :disabled="props.field.readOnly"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid || undefined"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <USelectMenu
    v-else-if="isOneResource"
    :id="props.id"
    :model-value="oneResource"
    :items="items"
    value-key="value"
    class="w-full"
    :aria-label="processText(props.field.label)"
    :disabled="props.field.readOnly"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid || undefined"
    @update:model-value="emit('update:modelValue', $event ? [$event] : [])"
  />
  <AgendaRelationInput
    v-else-if="isRelation && props.field.relation"
    :id="props.id"
    :relation="props.field.relation"
    :label="processText(props.field.label)"
    :model-value="props.modelValue"
    :disabled="props.field.readOnly"
    :invalid="props.invalid"
    :placeholder="
      props.field.placeholder ? processText(props.field.placeholder) : undefined
    "
    @update:model-value="emit('update:modelValue', $event)"
  />
  <Component
    :is="timeInput"
    v-else-if="isTime"
    :id="props.id"
    class="w-full"
    :model-value="timeMs"
    :disabled="props.field.readOnly"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid || undefined"
    @update:model-value="setTimeMs"
  />
  <MatrixFieldInput
    v-else-if="isDateTime"
    :id="props.id"
    :column="column"
    :model-value="dateTimeModel"
    :disabled="props.field.readOnly"
    :invalid="props.invalid"
    @update:model-value="setDateTime"
  />
  <MatrixFieldInput
    v-else
    :id="props.id"
    :column="column"
    :model-value="props.modelValue"
    :disabled="props.field.readOnly"
    :invalid="props.invalid"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
