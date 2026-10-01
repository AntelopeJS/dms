<script setup lang="ts">
import type { AuthFormError } from "../composables/useAuthFormError";

interface AuthFormAlertProps {
  error: AuthFormError | null;
}

const props = defineProps<AuthFormAlertProps>();
</script>

<template>
  <UAlert
    v-if="props.error"
    role="alert"
    color="error"
    variant="subtle"
    icon="i-ph-warning-circle"
    :title="props.error.title"
    :description="props.error.description"
    :ui="{
      root: 'px-3 py-2.5',
      title: 'text-[13px] font-semibold',
      description: 'text-[12.5px]',
    }"
  />
</template>
