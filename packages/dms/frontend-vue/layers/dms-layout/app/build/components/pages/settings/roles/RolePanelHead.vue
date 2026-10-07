<script setup lang="ts">
// v2 .cs-editor head, shared by the role editor and the owner panel: the
// icon well, the role's name as the panel's heading, then a mono detail.

interface RolePanelHeadProps {
  icon: string;
  /** Id of the heading, named by the panel's `aria-labelledby`. */
  titleId: string;
  /** Mono detail after the name (its members). */
  meta?: string;
}

const props = withDefaults(defineProps<RolePanelHeadProps>(), {
  meta: undefined,
});

interface RolePanelHeadSlots {
  /** The role's name, and what follows it (a lock). */
  default: () => unknown;
}

defineSlots<RolePanelHeadSlots>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-3 py-1.5">
    <DmsIconWell :icon="props.icon" size="md" />
    <h2
      :id="props.titleId"
      class="text-highlighted flex min-w-0 flex-wrap items-center gap-2 text-[15px] leading-[1.3] font-[650] tracking-[-0.01em]"
    >
      <slot />
      <span
        v-if="props.meta"
        class="text-dimmed font-mono text-[10.5px] font-medium"
      >
        {{ props.meta }}
      </span>
    </h2>
  </div>
</template>
