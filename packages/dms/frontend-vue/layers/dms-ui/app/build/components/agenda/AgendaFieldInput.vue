<script setup lang="ts">
import { computed } from "vue";
import MatrixFieldInput from "../matrix/MatrixFieldInput.vue";
import { resolveDmsComponent } from "../../../composables/resolveDmsComponent";
import type { AgendaFormField } from "../../composables/agenda/agendaForm";
import {
  dayOfWallClock,
  timeOfWallClock,
  withDay,
  withTime,
} from "../../composables/agenda/agendaFormTime";
import type { MatrixCellKind, MatrixColumn } from "../../../types/matrix";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The input of a details form field: the start and end as a day (and a time
 * unless all-day), the resources as a multiple select, a `time` field as
 * the DMS time input, every other kind as the Matrix draws the same kind
 * (`MatrixFieldInput`: InputText, Textarea, InputNumber, Switch, Select...).
 */
interface AgendaFieldInputProps {
  field: AgendaFormField;
  modelValue: unknown;
  id?: string;
  invalid?: boolean;
  /** The event is all-day: start and end show their day only. */
  allDay?: boolean;
}

const props = withDefaults(defineProps<AgendaFieldInputProps>(), {
  id: undefined,
  invalid: false,
  allDay: false,
});
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();
const { t } = useI18n();
const { processText } = useComposedText();

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const TIME_KIND = "time";

const isMoment = computed(
  () => props.field.builtIn === "start" || props.field.builtIn === "end",
);
const isResources = computed(() => props.field.builtIn === "resourceIds");
const isTime = computed(() => props.field.kind === TIME_KIND);
const datePicker = resolveDmsComponent("dms-date-picker");
const timeInput = resolveDmsComponent("dms-input-time");

const column = computed<MatrixColumn>(() => ({
  id: props.field.id,
  label: props.field.label,
  kind: props.field.kind as MatrixCellKind,
  options: props.field.options,
}));
const items = computed(() =>
  props.field.options.map((option) => ({
    label: processText(option.label),
    value: option.value,
    icon: option.icon,
  })),
);

const moment = computed(() => String(props.modelValue ?? ""));
const setDay = (day: unknown) => {
  if (typeof day === "string" && day)
    emit("update:modelValue", withDay(moment.value, day.slice(0, 10)));
};
const setTime = (time: unknown) => {
  if (typeof time === "string" && time)
    emit("update:modelValue", withTime(moment.value, time));
};

/** A `time` field holds "HH:mm"; the DMS time input, milliseconds. */
const timeMs = computed(() => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(props.modelValue ?? ""));
  if (!match) return null;
  return (Number(match[1]) * MINUTES_PER_HOUR + Number(match[2])) * MINUTE_MS;
});
const setTimeMs = (value: unknown) => {
  if (typeof value !== "number") {
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
      type="time"
      class="w-32"
      :model-value="timeOfWallClock(moment)"
      :disabled="props.field.readOnly"
      :color="props.invalid ? 'error' : undefined"
      :highlight="props.invalid || undefined"
      :aria-label="
        t('dms.agenda.form.time_of', { field: processText(props.field.label) })
      "
      @update:model-value="setTime"
    />
  </div>
  <USelectMenu
    v-else-if="isResources"
    :id="props.id"
    :model-value="(props.modelValue as string[] | undefined) ?? []"
    :items="items"
    value-key="value"
    multiple
    class="w-full"
    :disabled="props.field.readOnly"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid || undefined"
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
    v-else
    :id="props.id"
    :column="column"
    :model-value="props.modelValue"
    :disabled="props.field.readOnly"
    :invalid="props.invalid"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
