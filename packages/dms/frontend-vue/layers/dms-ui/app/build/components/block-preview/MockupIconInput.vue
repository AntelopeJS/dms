<script setup lang="ts">
/**
 * An icon name typed in, drawn beside the field as it is typed: a page's
 * icon in its inspector, a section's from its menu.
 */
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
