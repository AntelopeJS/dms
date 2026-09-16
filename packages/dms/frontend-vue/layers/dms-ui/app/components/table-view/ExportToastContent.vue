<template>
  <div class="flex w-full flex-col gap-2">
    <span class="text-muted text-xs">{{ label }}</span>
    <div class="flex items-center gap-2">
      <UProgress
        v-if="progress !== null"
        :model-value="progress"
        size="sm"
        class="flex-1"
      />
      <UProgress v-else animation="carousel" size="sm" class="flex-1" />
      <span v-if="progress !== null" class="text-muted text-xs tabular-nums">
        {{ progress }}%
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  progress: number | null;
}>();
</script>
