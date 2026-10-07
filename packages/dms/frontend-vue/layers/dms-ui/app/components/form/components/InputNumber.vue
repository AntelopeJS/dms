<script setup lang="ts">
import type {
  InputNumberProps,
  InputNumberEmits,
  InputNumberSlots,
} from "@nuxt/ui/components/InputNumber.vue";
import { useForwardPropsEmits } from "reka-ui";
import { useControlError } from "../../../build/composables/form/useControlError";

defineOptions({ inheritAttrs: false });

const props = defineProps<InputNumberProps>();
const emits = defineEmits<InputNumberEmits>();
defineSlots<InputNumberSlots>();

const forwarded = useForwardPropsEmits(props, emits);

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
  <div class="contents" @beforeinput.capture="onIncomingText">
    <UInputNumber
      v-bind="{ ...forwarded, ...$attrs }"
      :orientation="props.orientation ?? DEFAULT_ORIENTATION"
      :increment="{ color: 'neutral' }"
      :decrement="{ color: 'neutral' }"
    />
  </div>
</template>
