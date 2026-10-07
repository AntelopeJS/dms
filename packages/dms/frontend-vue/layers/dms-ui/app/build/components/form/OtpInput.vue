<script setup lang="ts">
import { computed, useId, useTemplateRef } from "vue";
import DmsFieldError from "../../../components/field-error/FieldError.vue";
import { fieldErrorId } from "#dms-core/app/composables/useFieldErrors";
import { focusFirstEmptyCell } from "../../utils/codeCells";

// The one code entry of the DMS (sign-in and e-mail codes, two-factor codes
// in the security settings): UPinInput cells, the refused code's message
// under them.

type OtpInputSize = "md" | "lg" | "xl";

interface OtpInputProps {
  /** Accessible name of the cells. */
  label: string;
  length?: number;
  type?: "text" | "number";
  size?: OtpInputSize;
  disabled?: boolean;
  /** A one-time code sent by e-mail or an app: the browser may offer it. */
  isOtp?: boolean;
  /** Reads the code as two halves, with a gap after the middle cell. */
  isSplit?: boolean;
  /** Centres the cells and the error under them. */
  isCentered?: boolean;
  /** A code the API refused, shown under the cells (marked invalid). */
  error?: string;
}

const DEFAULT_CODE_LENGTH = 6;

// Six cells at their desktop size outgrow a 320px card or modal: on a phone
// they narrow and close up.
const PHONE_UI: Record<OtpInputSize, { root: string; base: string }> = {
  md: { root: "max-sm:gap-1", base: "max-sm:w-8" },
  lg: { root: "max-sm:gap-1", base: "max-sm:w-8" },
  xl: { root: "", base: "max-[22.5rem]:w-9" },
};
const SPLIT_CELL = "[&:nth-child(3)]:me-3 max-sm:[&:nth-child(3)]:me-2";

const props = withDefaults(defineProps<OtpInputProps>(), {
  length: DEFAULT_CODE_LENGTH,
  type: "text",
  size: "md",
  disabled: false,
  isOtp: false,
  isSplit: false,
  isCentered: false,
  error: undefined,
});

const emit = defineEmits<{
  /** Every cell is filled. */
  complete: [];
}>();

const model = defineModel<string[] | undefined>();
const root = useTemplateRef<HTMLElement>("root");
const errorId = fieldErrorId(`otp-${useId()}`);

const ui = computed(() => ({
  root: PHONE_UI[props.size].root,
  base: [PHONE_UI[props.size].base, props.isSplit && SPLIT_CELL],
}));

/**
 * Puts the caret in the first empty cell. A form disables the cells while
 * it submits: the focus waits a task for them to be enabled again.
 */
function focus(): void {
  setTimeout(() => focusFirstEmptyCell(root.value));
}

defineExpose({ focus });
</script>

<template>
  <div class="grid gap-2">
    <div
      ref="root"
      role="group"
      :aria-label="props.label"
      :aria-describedby="props.error ? errorId : undefined"
      class="flex"
      :class="props.isCentered && 'justify-center'"
    >
      <UPinInput
        v-model="model"
        :length="props.length"
        :disabled="props.disabled"
        :otp="props.isOtp"
        :type="props.type"
        :size="props.size"
        :color="props.error ? 'error' : undefined"
        :highlight="!!props.error"
        :aria-invalid="!!props.error || undefined"
        :aria-describedby="props.error ? errorId : undefined"
        :ui="ui"
        @complete="emit('complete')"
      />
    </div>
    <DmsFieldError
      :id="errorId"
      :class="props.isCentered && 'justify-center'"
      :message="props.error"
    />
  </div>
</template>
