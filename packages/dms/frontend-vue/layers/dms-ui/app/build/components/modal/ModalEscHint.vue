<script setup lang="ts">
interface ModalEscHintProps {
  label: string;
}

const props = defineProps<ModalEscHintProps>();
</script>

<template>
  <!-- A one-line wrapping row clipped to its first line: the empty marker
  holds that line, so a hint wider than the room wraps to the hidden second
  line rather than overflow the first. -->
  <span
    class="me-auto flex h-5 min-w-0 flex-1 flex-wrap overflow-hidden"
    data-modal-esc-hint
  >
    <span aria-hidden="true" class="h-5 w-0" />
    <span
      class="text-dimmed flex h-5 items-center gap-1.5 text-xs whitespace-nowrap"
    >
      <UKbd value="Esc" size="sm" />
      {{ props.label }}
    </span>
  </span>
</template>
