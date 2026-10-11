<script setup lang="ts">
import type {
  InputNumberProps,
  InputNumberEmits,
  InputNumberSlots,
} from "@nuxt/ui/components/InputNumber.vue";
import { computed } from "vue";
import { useForwardPropsEmits } from "reka-ui";
import { useControlError } from "../../../build/composables/form/useControlError";

defineOptions({ inheritAttrs: false });

interface InputNumberFieldProps extends InputNumberProps {
  /** Unit after the field ("days"): an i18n key with `$`, or a literal. */
  suffix?: string;
}

const props = defineProps<InputNumberFieldProps>();
const emits = defineEmits<InputNumberEmits>();
defineSlots<InputNumberSlots>();

const forwarded = useForwardPropsEmits(props, emits);
const inputProps = computed(() => {
  const { suffix: _suffix, ...rest } = forwarded.value;
  return rest;
});
const { processI18n } = useTranslation();

// v2 number fields keep the value left-aligned with a compact caret stepper.
const DEFAULT_ORIENTATION = "vertical";

// A minus typed or pasted where no negative number is allowed is refused
// by the field before it shows: it says why, rather than leaving an emptied
// field to read as never filled.
const BELOW_MIN = "$dms.field_errors.too_small";
const { report } = useControlError();

function onIncomingText(event: InputEvent): void {
  const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
  if (!text) return;
  const refusesNegative = props.min !== undefined && props.min >= 0;
  report(refusesNegative && text.includes("-") ? BELOW_MIN : undefined);
}
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
