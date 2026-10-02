<script setup lang="ts">
interface AuthCodeInputProps {
  length?: number;
  disabled?: boolean;
  /** One-time code from an e-mail: lets the browser offer it. */
  isOtp?: boolean;
}

const DEFAULT_CODE_LENGTH = 6;

const props = withDefaults(defineProps<AuthCodeInputProps>(), {
  length: DEFAULT_CODE_LENGTH,
  disabled: false,
  isOtp: false,
});

const model = defineModel<string[] | undefined>();
const { t } = useI18n();
</script>

<template>
  <!-- v2 .au-otp: the xl pin input theme draws the 46x52 mono cells; the
       code reads as two groups of three. -->
  <div
    role="group"
    :aria-label="t('page.auth.code.label')"
    class="flex justify-center"
  >
    <UPinInput
      v-model="model"
      :length="props.length"
      :disabled="props.disabled"
      :otp="props.isOtp"
      type="text"
      size="xl"
      :ui="{ base: '[&:nth-child(3)]:me-3 max-sm:[&:nth-child(3)]:me-2' }"
    />
  </div>
</template>
