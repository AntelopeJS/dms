<script setup lang="ts">
interface Props {
  fullWidth?: boolean;
}

const props = defineProps<Props>();
</script>

<template>
  <UContainer :class="{ 'max-w-none': props.fullWidth }">
    <slot />
  </UContainer>
</template>
