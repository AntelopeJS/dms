<script setup lang="ts">
/**
 * One labelled demo inside a ShowcaseSection: the props it shows, in mono,
 * above the rendered component.
 */
interface Props {
  /** The props shown, as written in a template (`tone="success"`). */
  label: string;
  /** Spans every column of the section grid. */
  wide?: boolean;
}

const props = withDefaults(defineProps<Props>(), { wide: false });
</script>

<template>
  <div
    class="grid min-w-0 content-start gap-3"
    :class="props.wide && 'col-span-full'"
  >
    <code class="text-dimmed font-mono text-[11px] leading-tight font-medium">
      {{ props.label }}
    </code>
    <slot />
  </div>
</template>
