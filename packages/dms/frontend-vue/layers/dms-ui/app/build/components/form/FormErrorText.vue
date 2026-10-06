<script setup lang="ts">
interface FormErrorTextProps {
  /** The message UFormField hands its `error` slot. */
  error?: string | boolean;
}

const props = defineProps<FormErrorTextProps>();
</script>

<template>
  <template v-if="props.error">
    <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
    {{ props.error }}
  </template>
</template>
