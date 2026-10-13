<script setup lang="ts">
/**
 * One labelled demo inside a ShowcaseSection: the props it shows, in mono,
 * above the rendered component, and optionally the code that draws it.
 */
interface Props {
  /** The props shown, as written in a template (`tone="success"`). */
  label: string;
  /** Spans every column of the section grid. */
  wide?: boolean;
  /** Usage a reader can copy, shown under the demo. */
  code?: string;
  /** Language of `code`, as `DmsCodeSnippet` reads it. */
  language?: string;
}

const props = withDefaults(defineProps<Props>(), {
  wide: false,
  code: undefined,
  language: "typescript",
});
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
    <DmsCodeSnippet
      v-if="props.code"
      :code="props.code"
      :language="props.language"
    />
  </div>
</template>
