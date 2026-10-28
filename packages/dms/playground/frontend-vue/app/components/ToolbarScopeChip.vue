<script setup lang="ts">

interface Props {
  label: string;
  icon?: string;
}

withDefaults(defineProps<Props>(), { icon: "i-ph-globe-simple" });

const { heightClass } = usePageToolbarSize();
</script>

<template>
  <span
    class="border-default bg-default text-toned inline-flex items-center gap-1.5 rounded-md border px-2 text-[12.5px] font-medium"
    :class="heightClass"
  >
    <UIcon :name="icon" class="text-muted size-3.5" />
    {{ label }}
  </span>
</template>
