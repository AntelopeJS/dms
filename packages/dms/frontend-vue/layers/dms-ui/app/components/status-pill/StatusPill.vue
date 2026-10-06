<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";
import {
  DMS_TONE_OUTLINE,
  DMS_TONE_SOFT,
  DMS_TONE_TEXT,
  isDmsTone,
} from "../../build/utils/tone";
import type { Tone } from "../../types/tone";

export type StatusPillDot = "none" | "static" | "live";
export type StatusPillSize = "sm" | "md";
export type StatusPillVariant = "soft" | "outline" | "text";

interface StatusPillProps {
  /**
   * Semantic tone, or any Nuxt UI color name (`--ui-<name>` must exist) for
   * statuses configured by the backend; unknown names get an inline tint.
   */
  tone?: Tone | (string & {});
  /** Visible text (the default slot overrides it). */
  label?: string;
  /**
   * Leading dot: `static`, `live` (glow + a pulsing halo, still under
   * `prefers-reduced-motion`) or `none`. Ignored when `icon` is set.
   */
  dot?: StatusPillDot;
  /** `md` 22px (v2 .status, table cells), `sm` 20px (tile corner). */
  size?: StatusPillSize;
  /** Mono label (v2 default); `false` uses the sans font. */
  mono?: boolean;
  /** Uppercase tracked label (module tile state). */
  uppercase?: boolean;
  /** Leading icon in place of the dot. */
  icon?: string;
  /**
   * `soft` tinted pill (default), `outline` hairline pill, `text` the colored
   * label alone (overview card state line).
   */
  variant?: StatusPillVariant;
}

interface StatusPillSlots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<StatusPillProps>(), {
  tone: "neutral",
  label: undefined,
  dot: "static",
  size: "md",
  mono: true,
  uppercase: false,
  icon: undefined,
  variant: "soft",
});
defineSlots<StatusPillSlots>();

const CUSTOM_TINT_PERCENT = 12;

// v2 .status: mono label on a tint of its tone, led by a 6px dot.
const theme = tv({
  slots: {
    root: "inline-flex items-center font-semibold whitespace-nowrap",
    dot: "relative shrink-0 rounded-full bg-current",
    halo: "absolute inset-0 rounded-full bg-current opacity-60 motion-safe:animate-ping",
    icon: "shrink-0",
    label: "",
  },
  variants: {
    variant: {
      soft: { root: "rounded-full" },
      outline: { root: "rounded-full border bg-transparent" },
      // A state line may run long: it wraps like text instead of a pill.
      text: { root: "whitespace-normal" },
    },
    size: {
      sm: { root: "gap-1.5 text-[10px]", dot: "size-[5px]", icon: "size-3" },
      md: { root: "gap-1.5 text-[11px]", dot: "size-1.5", icon: "size-3.5" },
    },
    mono: {
      true: { root: "font-mono tracking-[0.02em]" },
      false: { root: "font-sans" },
    },
    uppercase: {
      true: { root: "tracking-[0.1em] uppercase" },
    },
    live: {
      true: { dot: "shadow-[0_0_8px_currentColor]" },
    },
  },
  compoundVariants: [
    { variant: ["soft", "outline"], size: "sm", class: { root: "h-5 px-2" } },
    {
      variant: ["soft", "outline"],
      size: "md",
      class: { root: "h-[22px] px-[9px]" },
    },
    { variant: "text", size: "md", class: { root: "text-[11.5px]" } },
    {
      variant: "text",
      mono: true,
      uppercase: false,
      class: { root: "font-medium tracking-normal" },
    },
    { variant: "soft", mono: false, size: "md", class: { root: "text-xs" } },
  ],
});

const isKnownTone = computed(() => isDmsTone(props.tone));

const toneClass = computed(() => {
  const tone = props.tone;
  if (!isDmsTone(tone)) return "";
  if (props.variant === "soft") return DMS_TONE_SOFT[tone];
  const text = props.variant === "text" && tone === "neutral";
  const color = text ? "text-dimmed" : DMS_TONE_TEXT[tone];
  return props.variant === "outline"
    ? `${color} ${DMS_TONE_OUTLINE[tone]}`
    : color;
});

// A backend-configured color outside the semantic set: tint it inline.
const customStyle = computed(() => {
  if (isKnownTone.value) return undefined;
  const color = `var(--ui-${props.tone})`;
  return {
    color,
    backgroundColor:
      props.variant === "soft"
        ? `color-mix(in srgb, ${color} ${CUSTOM_TINT_PERCENT}%, transparent)`
        : undefined,
    borderColor:
      props.variant === "outline"
        ? `color-mix(in srgb, ${color} 35%, transparent)`
        : undefined,
  };
});

const ui = computed(() =>
  theme({
    variant: props.variant,
    size: props.size,
    mono: props.mono,
    uppercase: props.uppercase,
    live: props.dot === "live",
  }),
);
</script>

<template>
  <span :class="[ui.root(), toneClass]" :style="customStyle">
    <UIcon
      v-if="props.icon"
      :name="props.icon"
      :class="ui.icon()"
      :aria-hidden="true"
    />
    <span v-else-if="props.dot !== 'none'" :class="ui.dot()" aria-hidden="true">
      <span v-if="props.dot === 'live'" :class="ui.halo()" />
    </span>
    <span :class="ui.label()">
      <slot>{{ props.label }}</slot>
    </span>
  </span>
</template>
