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
import {
  type InputWidth,
  isCompactNumberInput,
} from "../../../build/utils/inputWidth";
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
  /**
   * `"compact"` sizes the field for a short number from `sm` up, `"full"`
   * fills the row; left out, a `max` of a few digits makes it compact.
   */
  width?: InputWidth;
  /**
   * `true` puts a typed value on the nearest `step` when the field is left.
   * Off by default: `step` only drives the steppers and the arrow keys, and
   * a value is never rewritten (9,692 kept as 9,692 with steps of 100).
   */
  stepSnapping?: boolean;
}

interface InputNumberAdjustEmits {
  /**
   * The field kept another value than the one typed, on leaving it or on
   * Enter: clamped to `min` / `max`, or put on its `step` (`stepSnapping`).
   */
  adjust: [adjustment: InputNumberAdjustment];
}

type InputNumberFieldEmits = InputNumberEmits & InputNumberAdjustEmits;

const props = withDefaults(defineProps<InputNumberFieldProps>(), {
  clamp: true,
  stepSnapping: false,
});
const emits = defineEmits<InputNumberFieldEmits>();
defineSlots<InputNumberSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const bounds = computed(() => ({ min: props.min, max: props.max }));

const inputProps = computed(() => {
  const {
    suffix: _suffix,
    clamp: _clamp,
    width: _width,
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
const isCompact = computed(() => isCompactNumberInput(props));
const { processI18n } = useTranslation();
const { locale } = useI18n();

const DEFAULT_ORIENTATION = "vertical";

const SUFFIX_BASE_CLASS = "pe-[calc(var(--dms-field-suffix-width)+2.375rem)]";
const suffixText = computed(() =>
  props.suffix ? processI18n(props.suffix) : "",
);
const suffixStyle = computed(() =>
  suffixText.value
    ? { "--dms-field-suffix-width": `${suffixText.value.length}ch` }
    : undefined,
);
const fieldUi = computed(() =>
  suffixText.value
    ? { ...props.ui, base: [props.ui?.base, SUFFIX_BASE_CLASS] }
    : props.ui,
);

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

let typedText: string | null = null;
let settledValue: number | null | undefined;

function onTyped(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  typedText = input.value;
  settledValue = undefined;
}

function onSettledValue(value: number | null | undefined): void {
  settledValue = value;
}

function redraw(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("change"));
}

/** Once the field applied the typed text: on leaving it, or on Enter. */
async function settle(event: Event): Promise<void> {
  if (typedText === null) return;
  const text = typedText;
  typedText = null;
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  await nextTick();
  const typed = parseTypedNumber(text, props.locale ?? locale.value);
  const kept = settledValue === undefined ? props.modelValue : settledValue;
  const adjustment = numberAdjustment(
    typed,
    kept,

    props.clamp ? bounds.value : {},
  );
  if (!adjustment) return;
  emits("adjust", adjustment);
  redraw(input);
}
</script>

<template>
  <div
    :class="suffixText ? 'relative flex items-center' : 'contents'"
    :style="suffixStyle"
    @beforeinput.capture="onIncomingText"
    @input="onTyped"
    @keydown.enter="settle"
  >
    <UInputNumber
      v-bind="{ ...inputProps, ...$attrs }"
      @blur="settle"
      @update:model-value="onSettledValue"
      :class="[suffixText && 'min-w-0 flex-1', isCompact && 'sm:max-w-44']"
      :ui="fieldUi"
      :orientation="props.orientation ?? DEFAULT_ORIENTATION"
      :increment="{ color: 'neutral' }"
      :decrement="{ color: 'neutral' }"
    />
    <span
      v-if="suffixText"
      class="text-muted pointer-events-none absolute inset-y-0 end-8 flex items-center text-[13px] whitespace-nowrap"
      data-field-suffix
    >
      {{ suffixText }}
    </span>
  </div>
</template>
