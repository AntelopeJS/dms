<script setup lang="ts">
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <UInput
    :model-value="modelValue"
    class="w-full"
    :icon="modelValue || undefined"
    placeholder="i-ph-shopping-cart"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>
