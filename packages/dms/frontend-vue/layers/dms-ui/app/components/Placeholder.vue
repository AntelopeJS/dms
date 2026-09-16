<script lang="ts" setup>
interface PlaceholderProps {
  label?: string;
  height?: string;
  width?: string;
}

const props = withDefaults(defineProps<PlaceholderProps>(), {
  label: undefined,
  height: "120px",
  width: undefined,
});
</script>

<template>
  <div
    :style="{
      height: props.height,
      width: props.width,
    }"
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
