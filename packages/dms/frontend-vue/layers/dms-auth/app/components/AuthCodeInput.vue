<script setup lang="ts">
import { useId, useTemplateRef } from "vue";
import DmsFieldError from "#dms-ui/app/components/field-error/FieldError.vue";
import { fieldErrorId } from "#dms-core/app/composables/useFieldErrors";

interface AuthCodeInputProps {
  length?: number;
  disabled?: boolean;
  /** One-time code from an e-mail: lets the browser offer it. */
  isOtp?: boolean;
  /** A code the API refused, shown under the cells (marked invalid). */
  error?: string;
}

const DEFAULT_CODE_LENGTH = 6;

const props = withDefaults(defineProps<AuthCodeInputProps>(), {
  length: DEFAULT_CODE_LENGTH,
  disabled: false,
  isOtp: false,
  error: undefined,
});

const model = defineModel<string[] | undefined>();
const { t } = useI18n();
const root = useTemplateRef<HTMLElement>("root");
const errorId = fieldErrorId(`auth-code-${useId()}`);

/**
 * Puts the caret in the first empty cell (after a refused or partial code).
 * The form disables the cells while it submits: the focus waits a task for
 * them to be enabled again.
 */
function focus(): void {
  setTimeout(() => {
    const cells = [
      ...(root.value?.querySelectorAll<HTMLInputElement>("input") ?? []),
    ];
    (cells.find((cell) => !cell.value) ?? cells[0])?.focus();
  });
}

defineExpose({ focus });
</script>

<template>
  <div class="grid gap-2">
    <!-- v2 .au-otp: the xl pin input theme draws the 46x52 mono cells; the
         code reads as two groups of three. Under 360px the cells narrow to
         36px so the six still fit inside the card. -->
    <div
      ref="root"
      role="group"
      :aria-label="t('page.auth.code.label')"
      :aria-describedby="props.error ? errorId : undefined"
      class="flex justify-center"
    >
      <UPinInput
        v-model="model"
        :length="props.length"
        :disabled="props.disabled"
        :otp="props.isOtp"
        type="text"
        size="xl"
        :color="props.error ? 'error' : undefined"
        :highlight="!!props.error"
        :aria-invalid="!!props.error || undefined"
        :aria-describedby="props.error ? errorId : undefined"
        :ui="{
          base: '[&:nth-child(3)]:me-3 max-sm:[&:nth-child(3)]:me-2 max-[22.5rem]:w-9',
        }"
      />
    </div>
    <DmsFieldError
      :id="errorId"
      class="justify-center"
      :message="props.error"
    />
  </div>
</template>
