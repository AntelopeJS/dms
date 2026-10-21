<script setup lang="ts">
import type {
  InputNumberProps,
  InputNumberEmits,
  InputNumberSlots,
} from "@nuxt/ui/components/InputNumber.vue";
import { computed, nextTick, watch } from "vue";
import { useForwardPropsEmits } from "reka-ui";
import { useControlError } from "../../../composables/form/useControlError";
import {
  BELOW_MIN_MESSAGE,
  numberRangeError,
  numberStepperState,
} from "../../../build/composables/form/numberRange";
import {
  numberAdjustment,
  parseTypedNumber,
} from "../../../build/utils/numberAdjustment";
import type { InputNumberAdjustment } from "../../../types/input-number";

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

interface InputNumberAdjustEmits {
  /**
   * The field kept another value than the one typed, on leaving it or on
   * Enter: clamped to `min` / `max`, or put on its `step`.
   */
  adjust: [adjustment: InputNumberAdjustment];
}

type InputNumberFieldEmits = InputNumberEmits & InputNumberAdjustEmits;

const props = withDefaults(defineProps<InputNumberFieldProps>(), {
  clamp: true,
});
const emits = defineEmits<InputNumberFieldEmits>();
defineSlots<InputNumberSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const bounds = computed(() => ({ min: props.min, max: props.max }));
// Unclamped, the input is not told the bounds (it would clamp to them on
// blur): its steppers stop there instead, and the range is checked here.
const inputProps = computed(() => {
  const {
    suffix: _suffix,
    clamp: _clamp,
    onAdjust: _onAdjust,
    ...rest
  } = forwarded.value;
  if (props.clamp) return rest;
  const { min: _min, max: _max, ...unbounded } = rest;
  return {
    ...unbounded,
    ...numberStepperState(props.modelValue, bounds.value),
  };
});
const { processI18n } = useTranslation();
const { locale } = useI18n();

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

// What was typed since the field last settled, and the value it settled on.
let typedText: string | null = null;
let settledValue: number | null | undefined;

function onTyped(event: Event): void {
  typedText = (event.target as HTMLInputElement).value;
  settledValue = undefined;
}

function onSettledValue(value: number | null | undefined): void {
  settledValue = value;
}

// The number field keeps its own copy of the text typed, which it does not
// always redraw when it settles on the value it already held (1020 typed
// over 1,000): its `change` handler copies the kept value's text back.
function redraw(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("change"));
}

/** Once the field applied the typed text: on leaving it, or on Enter. */
async function settle(event: Event): Promise<void> {
  if (typedText === null) return;
  const text = typedText;
  typedText = null;
  const input = event.target as HTMLInputElement;
  await nextTick();
  const typed = parseTypedNumber(text, props.locale ?? locale.value);
  const kept = settledValue === undefined ? props.modelValue : settledValue;
  const adjustment = numberAdjustment(
    typed,
    kept,
    // Unclamped, only the step changes what was typed.
    props.clamp ? bounds.value : {},
  );
  if (!adjustment) return;
  emits("adjust", adjustment);
  redraw(input);
}
</script>

<template>
  <!-- The unit sits after the field rather than inside it, where the
    stepper already takes the end of the box. -->
  <div
    :class="props.suffix ? 'flex items-center gap-2' : 'contents'"
    @beforeinput.capture="onIncomingText"
    @input="onTyped"
    @keydown.enter="settle"
  >
    <UInputNumber
      v-bind="{ ...inputProps, ...$attrs }"
      @blur="settle"
      @update:model-value="onSettledValue"
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
