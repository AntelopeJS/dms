<script setup lang="ts">
// "Unsaved changes" with its amber dot: the save bar's status, and the
// footer of a form that keeps its own buttons (a security panel).

interface UnsavedStatusProps {
  /** What is unsaved; empty, the line keeps its place (a hidden save bar). */
  text: string;
  /** The footer band's look: a ringed dot and 12.5px text. */
  isBand?: boolean;
}

const props = withDefaults(defineProps<UnsavedStatusProps>(), {
  isBand: false,
});
</script>

<template>
  <span
    class="text-muted flex min-w-0 items-center gap-2"
    :class="props.isBand && 'text-[12.5px]'"
    role="status"
  >
    <span
      class="bg-warning size-[7px] shrink-0 rounded-full"
      :class="props.isBand && 'ring-warning/15 ring-3'"
      aria-hidden="true"
    />
    <span class="truncate">{{ props.text }}</span>
  </span>
</template>
