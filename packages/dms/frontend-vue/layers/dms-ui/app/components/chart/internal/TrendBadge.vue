<script setup lang="ts">
import { computed } from "vue";
import { formatDeltaPercent } from "../../../composables/chart/formatValue";

type TrendTone = "up" | "down" | "flat";
type TrendBadgeVariant = "pill" | "text";

interface Props {
  delta: number | null | undefined;
  invert?: boolean;
  suffix?: string;
  /** "pill" = tinted mono chip (chart cards), "text" = bare mono delta (KPI, lists). */
  variant?: TrendBadgeVariant;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "pill",
});

const TONE_CLASSES: Record<TrendBadgeVariant, Record<TrendTone, string>> = {
  pill: {
    up: "bg-(--dms-success-tint) text-success",
    down: "bg-(--dms-error-tint) text-error",
    flat: "bg-(--dms-neutral-tint) text-muted",
  },
  text: {
    up: "text-success",
    down: "text-error",
    flat: "text-muted",
  },
};

const VARIANT_CLASSES: Record<TrendBadgeVariant, string> = {
  pill: "h-5 gap-1 rounded-[5px] px-1.5 text-[11.5px]",
  text: "gap-[3px] text-xs",
};

const DIRECTION_ICON: Record<TrendTone, string> = {
  up: "i-ph-trend-up",
  down: "i-ph-trend-down",
  flat: "i-ph-minus",
};

const DIRECTION_GLYPH: Record<TrendTone, string> = {
  up: "▲",
  down: "▼",
  flat: "●",
};

const INVERTED_TONE: Record<TrendTone, TrendTone> = {
  up: "down",
  down: "up",
  flat: "flat",
};

const EMPTY_DISPLAY = "—";

const { locale } = useI18n();

function directionOf(delta: number | null | undefined): TrendTone {
  if (delta === null || delta === undefined || delta === 0) return "flat";
  return delta > 0 ? "up" : "down";
}

// The arrow follows the raw direction; the colour follows the meaning.
const direction = computed(() => directionOf(props.delta));
const tone = computed(() =>
  props.invert ? INVERTED_TONE[direction.value] : direction.value,
);

const hasDelta = computed(
  () => props.delta !== null && props.delta !== undefined,
);

const display = computed(() => {
  if (props.delta === null || props.delta === undefined) return EMPTY_DISPLAY;
  const percent = formatDeltaPercent(props.delta, locale.value);
  return `${percent}${props.suffix ?? ""}`;
});
</script>

<template>
  <span
    class="inline-flex items-center font-mono font-semibold whitespace-nowrap tabular-nums transition-colors"
    :class="[VARIANT_CLASSES[variant], TONE_CLASSES[variant][tone]]"
  >
    <UIcon
      v-if="variant === 'pill'"
      :name="DIRECTION_ICON[direction]"
      class="size-3"
      :aria-hidden="true"
    />
    <span v-else-if="hasDelta" aria-hidden="true">
      {{ DIRECTION_GLYPH[direction] }}
    </span>
    {{ display }}
  </span>
</template>
