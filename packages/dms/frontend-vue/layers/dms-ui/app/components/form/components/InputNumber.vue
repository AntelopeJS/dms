<script setup lang="ts">
import type {
  InputNumberProps,
  InputNumberEmits,
  InputNumberSlots,
} from "@nuxt/ui/components/InputNumber.vue";
import { computed, watch } from "vue";
import { useForwardPropsEmits } from "reka-ui";
import { useControlError } from "../../../build/composables/form/useControlError";
import {
  BELOW_MIN_MESSAGE,
  numberRangeError,
  numberStepperState,
} from "../../../build/composables/form/numberRange";

defineOptions({ inheritAttrs: false });

interface InputNumberFieldProps extends InputNumberProps {
  /** Unit after the field ("days"): an i18n key with `$`, or a literal. */
  suffix?: string;
  /**
   * `false` keeps a value typed outside `min` / `max` as typed and reports
   * it as the field's error, instead of clamping it into range on blur.
   */
  clamp?: boolean;
}

const props = withDefaults(defineProps<InputNumberFieldProps>(), {
  clamp: true,
});
const emits = defineEmits<InputNumberEmits>();
defineSlots<InputNumberSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const bounds = computed(() => ({ min: props.min, max: props.max }));
// Unclamped, the input is not told the bounds (it would clamp to them on
// blur): its steppers stop there instead, and the range is checked here.
const inputProps = computed(() => {
  const { suffix: _suffix, clamp: _clamp, ...rest } = forwarded.value;
  if (props.clamp) return rest;
  const { min: _min, max: _max, ...unbounded } = rest;
  return {
    ...unbounded,
    ...numberStepperState(props.modelValue, bounds.value),
  };
});
const { processI18n } = useTranslation();

// v2 number fields keep the value left-aligned with a compact caret stepper.
const DEFAULT_ORIENTATION = "vertical";

// A minus typed or pasted where no negative number is allowed is refused
// by the field before it shows: it says why, rather than leaving an emptied
// field to read as never filled.
const { report } = useControlError();

function onIncomingText(event: InputEvent): void {
  if (!props.clamp) return;
  const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
  if (!text) return;
  const refusesNegative = props.min !== undefined && props.min >= 0;
  report(refusesNegative && text.includes("-") ? BELOW_MIN_MESSAGE : undefined);
}

watch(
  () =>
    props.clamp ? undefined : numberRangeError(props.modelValue, bounds.value),
  (message) => {
    if (!props.clamp) report(message);
  },
  { immediate: true },
);
</script>

<template>
  <!-- The unit sits after the field rather than inside it, where the
    stepper already takes the end of the box. -->
  <div
    :class="props.suffix ? 'flex items-center gap-2' : 'contents'"
    @beforeinput.capture="onIncomingText"
  >
    <UInputNumber
      v-bind="{ ...inputProps, ...$attrs }"
      :class="props.suffix && 'min-w-0 flex-1'"
      :orientation="props.orientation ?? DEFAULT_ORIENTATION"
      :increment="{ color: 'neutral' }"
      :decrement="{ color: 'neutral' }"
    />
    <span
      v-if="props.suffix"
      class="text-muted shrink-0 text-[13px]"
      data-field-suffix
    >
      {{ processI18n(props.suffix) }}
    </span>
  </div>
</template>
