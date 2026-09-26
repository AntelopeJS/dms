<script lang="ts" setup>
interface PlaceholderProps {
  label?: string;
  height?: string;
  width?: string;
}

/** What a box nobody sized is worth showing at, when nothing stretches it. */
const MIN_HEIGHT = "120px";

const props = withDefaults(defineProps<PlaceholderProps>(), {
  label: undefined,
  height: undefined,
  width: undefined,
});

/**
 * A placeholder stands in for content still to come, so it takes the room it is
 * given: a height of its own would keep it short in a row sized by its tallest
 * cell, and a layout laid out with these could not be read for what it will be.
 * A given height still wins, and a floor keeps a lone one visible.
 */
const box = computed(() => ({
  height: props.height,
  minHeight: props.height ? undefined : MIN_HEIGHT,
  width: props.width,
}));
</script>

<template>
  <div
    :style="box"
    class="border-accented relative flex items-center justify-center overflow-hidden rounded-md border border-dashed px-4 opacity-75"
  >
    <svg
      class="stroke-inverted/10 absolute inset-0 -z-10 size-full"
      fill="none"
    >
      <defs>
        <pattern
          id="pattern-5c1e4f0e-62d5-498b-8ff0-cf77bb448c8e"
          x="0"
          y="0"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path d="M-3 13 15-5M-5 5l18-18M-1 21 17 3" />
        </pattern>
      </defs>
      <rect
        stroke="none"
        fill="url(#pattern-5c1e4f0e-62d5-498b-8ff0-cf77bb448c8e)"
        width="100%"
        height="100%"
      />
    </svg>

    <slot>{{ props.label || "Placeholder" }}</slot>
  </div>
</template>
