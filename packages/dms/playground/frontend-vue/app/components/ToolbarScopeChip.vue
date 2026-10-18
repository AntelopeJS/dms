<script setup lang="ts">
// A module's own block on the left of a PageToolbar: the scope its page
// reads, as a chip.

interface Props {
  label: string;
  icon?: string;
}

withDefaults(defineProps<Props>(), { icon: "i-ph-globe-simple" });
</script>

<template>
  <span
    class="border-default bg-default text-toned inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12.5px] font-medium"
  >
    <UIcon :name="icon" class="text-muted size-3.5" />
    {{ label }}
  </span>
</template>
