<script setup lang="ts">
interface SecurityPasswordInputProps {
  id?: string;
  autocomplete: string;
  placeholder?: string;
  invalid?: boolean;
}

const props = withDefaults(defineProps<SecurityPasswordInputProps>(), {
  id: undefined,
  placeholder: undefined,
  invalid: false,
});

const model = defineModel<string>({ default: "" });
const { t } = useI18n();
const isVisible = ref(false);
</script>

<template>
  <UInput
    :id="props.id"
    v-model="model"
    :type="isVisible ? 'text' : 'password'"
    :autocomplete="props.autocomplete"
    :placeholder="props.placeholder"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid"
    :aria-invalid="props.invalid || undefined"
    icon="i-ph-lock-simple"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :icon="isVisible ? 'i-ph-eye-slash' : 'i-ph-eye'"
        :aria-label="
          isVisible
            ? t('page.settings.security.password.hide')
            : t('page.settings.security.password.show')
        "
        :aria-pressed="isVisible"
        @click="isVisible = !isVisible"
      />
    </template>
  </UInput>
</template>
