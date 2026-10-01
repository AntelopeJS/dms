<script setup lang="ts">
interface AuthPasswordInputProps {
  autocomplete: string;
  placeholder?: string;
  /** Id of the rules list the field is described by. */
  describedBy?: string;
  invalid?: boolean;
  /** Leading lock icon and a labelled Show / Hide toggle (v2 new password). */
  isNewPassword?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<AuthPasswordInputProps>(), {
  placeholder: undefined,
  describedBy: undefined,
  invalid: false,
  isNewPassword: false,
  disabled: false,
});

const model = defineModel<string | undefined>();
const { t } = useI18n();
const isVisible = ref(false);

const toggleLabel = computed(() =>
  t(isVisible.value ? "page.auth.password.hide" : "page.auth.password.show"),
);
</script>

<template>
  <UInput
    v-model="model"
    :type="isVisible ? 'text' : 'password'"
    :autocomplete="props.autocomplete"
    :placeholder="props.placeholder"
    :aria-describedby="props.describedBy"
    :aria-invalid="props.invalid || undefined"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid || undefined"
    :icon="props.isNewPassword ? 'i-ph-lock-simple' : undefined"
    :disabled="props.disabled"
    size="lg"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        :square="!props.isNewPassword"
        :icon="isVisible ? 'i-ph-eye-slash' : 'i-ph-eye'"
        :label="props.isNewPassword ? toggleLabel : undefined"
        :aria-label="toggleLabel"
        :aria-pressed="isVisible"
        :disabled="props.disabled"
        @click="isVisible = !isVisible"
      />
    </template>
  </UInput>
</template>
