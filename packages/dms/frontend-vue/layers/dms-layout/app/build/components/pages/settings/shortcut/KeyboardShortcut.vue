<script setup lang="ts">
interface Props {
  keys: string[];
}

defineProps<Props>();
</script>

<template>
  <div class="inline-flex shrink-0 items-center gap-[3px]">
    <UKbd v-for="(key, index) in keys" :key="index" :value="key" />
  </div>
</template>
