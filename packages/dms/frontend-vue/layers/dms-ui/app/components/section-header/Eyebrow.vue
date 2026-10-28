<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";
import { keepHyphenatedWords } from "../../build/utils/eyebrow";

export type EyebrowTone = "dimmed" | "muted" | "primary" | "error";
export type EyebrowSize = "xs" | "sm";

interface EyebrowProps {
  /** Element to render (`p`, `span`, `h3`, `dt`…). */
  as?: string;
  /** Text (the default slot overrides it). */
  label?: string;
  /**
   * `dimmed` (v2 .eyebrow default), `muted` (card heads), `primary` (stage
   * kicker), `error` (danger zone).
   */
  tone?: EyebrowTone;
  /** `sm` 10.5px (v2 --text-2xs), `xs` 9.5px (dense meta labels). */
  size?: EyebrowSize;
  /** Single line with an ellipsis. */
  truncate?: boolean;
}

interface EyebrowSlots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<EyebrowProps>(), {
  as: "p",
  label: undefined,
  tone: "dimmed",
  size: "sm",
  truncate: false,
});
defineSlots<EyebrowSlots>();

const theme = tv({
  base: "font-mono font-semibold tracking-[0.12em] uppercase",
  variants: {
    tone: {
      dimmed: "text-dimmed",
      muted: "text-muted",
      primary: "text-primary",
      error: "text-error",
    },
    size: {
      xs: "text-[9.5px] leading-[1.2]",
      sm: "text-[10.5px] leading-[1.2]",
    },
    truncate: {
      true: "truncate",
    },
  },
});

const text = computed(() =>
  props.label === undefined ? undefined : keepHyphenatedWords(props.label),
);

const classes = computed(() =>
  theme({ tone: props.tone, size: props.size, truncate: props.truncate }),
);
</script>

<template>
  <component :is="props.as" :class="classes">
    <slot>{{ text }}</slot>
  </component>
</template>
