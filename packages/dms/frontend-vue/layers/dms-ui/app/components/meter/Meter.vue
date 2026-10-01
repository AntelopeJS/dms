<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";

/**
 * Fill colors of a meter segment. `accent` is the brand fill, `soft` its
 * quieter line color (pending, reserved, locked).
 */
export type MeterTone =
  | "accent"
  | "soft"
  | "neutral"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info";
export type MeterFormat = "fraction" | "percent" | "value" | "none";
export type MeterSize = "xs" | "sm" | "md";

export interface MeterSegment {
  value: number;
  tone?: MeterTone;
  /** Legend text ("6 members"). */
  label?: string;
}

interface MeterProps {
  /**
   * Root element. `span` keeps a bar-only meter valid inside phrasing
   * content (a button, a label).
   */
  as?: string;
  /** Name of the measure, left of the value ("Seats"). */
  label?: string;
  /** Dimmed note after the label ("8 in use · 2 free"). */
  hint?: string;
  /** Single filled amount; ignored when `segments` is set. */
  value?: number;
  /** Total the bar stands for. */
  max?: number;
  /** Stacked fills, drawn in order with a 2px gap. */
  segments?: MeterSegment[];
  /** Shows the segment labels under the bar. */
  legend?: boolean;
  /** Value text right of the label: `8 / 10`, `80%`, `8` or nothing. */
  format?: MeterFormat;
  /** Replaces the formatted value text. */
  valueLabel?: string;
  /** Fill tone of a single value. */
  tone?: MeterTone;
  /** Percent of `max` from which the fill and value turn warning. */
  warnAt?: number;
  /** Percent of `max` from which the fill and value turn error. */
  errorAt?: number;
  /** Bar height: `xs` 4px (inline coverage), `sm` 6px (v2 .c-meter), `md` 8px. */
  size?: MeterSize;
}

interface MeterSlots {
  /** Extra legend content, pushed right (a "Manage" link). */
  "legend-end"?: () => unknown;
}

const props = withDefaults(defineProps<MeterProps>(), {
  as: "div",
  label: undefined,
  hint: undefined,
  value: 0,
  max: 100,
  segments: undefined,
  legend: false,
  format: "none",
  valueLabel: undefined,
  tone: "accent",
  warnAt: undefined,
  errorAt: undefined,
  size: "sm",
});
const slots = defineSlots<MeterSlots>();
const { locale } = useI18n();

const PERCENT = 100;

const FILL_CLASSES: Record<MeterTone, string> = {
  accent: "bg-(--dms-accent-fill)",
  soft: "bg-(--dms-accent-line)",
  neutral: "bg-(--ui-border-accented)",
  secondary: "bg-secondary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
};

// v2 .c-meter: a label line with the mono value, the bar, then the legend.
const theme = tv({
  slots: {
    root: "grid min-w-0 gap-1.5",
    top: "flex min-w-0 items-baseline gap-2 text-[13px]",
    label: "text-toned",
    hint: "text-dimmed truncate text-xs",
    value: "text-toned ms-auto font-mono text-xs font-semibold tabular-nums",
    track: "bg-accented flex w-full gap-0.5 overflow-hidden rounded-full",
    fill: "block h-full shrink-0 transition-[width] duration-300",
    legend: "text-muted flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs",
    swatch: "me-1.5 inline-block size-2 rounded-[2px] align-[-1px]",
  },
  variants: {
    size: {
      xs: { track: "h-1" },
      sm: { track: "h-1.5" },
      md: { track: "h-2" },
    },
    level: {
      ok: {},
      warning: { value: "text-warning" },
      error: { value: "text-error" },
    },
  },
});

const isSegmented = computed(() => !!props.segments?.length);
const safeMax = computed(() => (props.max > 0 ? props.max : 0));
const total = computed(() =>
  isSegmented.value
    ? props.segments!.reduce((sum, segment) => sum + segment.value, 0)
    : props.value,
);
const percentOf = (amount: number): number =>
  safeMax.value === 0
    ? 0
    : Math.min(Math.max((amount / safeMax.value) * PERCENT, 0), PERCENT);
const totalPercent = computed(() => percentOf(total.value));

const level = computed<"ok" | "warning" | "error">(() => {
  if (props.errorAt !== undefined && totalPercent.value >= props.errorAt) {
    return "error";
  }
  if (props.warnAt !== undefined && totalPercent.value >= props.warnAt) {
    return "warning";
  }
  return "ok";
});

const singleTone = computed<MeterTone>(() =>
  level.value === "ok" ? props.tone : level.value,
);

interface DrawnSegment {
  width: number;
  className: string;
  label?: string;
}

const drawn = computed<DrawnSegment[]>(() => {
  if (!isSegmented.value) {
    return [
      {
        width: totalPercent.value,
        // A lone fill keeps the rounded end of the track.
        className: `${FILL_CLASSES[singleTone.value]} rounded-[inherit]`,
      },
    ];
  }
  return props.segments!.map((segment) => ({
    width: percentOf(segment.value),
    className: FILL_CLASSES[segment.tone ?? "accent"],
    label: segment.label,
  }));
});

const legendEntries = computed(() =>
  drawn.value.filter((segment) => !!segment.label),
);

const formatNumber = (amount: number): string =>
  new Intl.NumberFormat(locale.value).format(amount);

const valueText = computed(() => {
  if (props.valueLabel) return props.valueLabel;
  switch (props.format) {
    case "fraction":
      return `${formatNumber(total.value)} / ${formatNumber(props.max)}`;
    case "percent":
      return `${Math.round(totalPercent.value)}%`;
    case "value":
      return formatNumber(total.value);
    default:
      return "";
  }
});

const hasTop = computed(
  () => !!props.label || !!props.hint || !!valueText.value,
);
const hasLegend = computed(
  () =>
    (props.legend && legendEntries.value.length > 0) || !!slots["legend-end"],
);
const ui = computed(() => theme({ size: props.size, level: level.value }));
</script>

<template>
  <component
    :is="props.as"
    :class="ui.root()"
    role="meter"
    :aria-label="props.label"
    :aria-valuenow="total"
    aria-valuemin="0"
    :aria-valuemax="props.max"
    :aria-valuetext="valueText || undefined"
  >
    <span v-if="hasTop" :class="ui.top()">
      <span v-if="props.label" :class="ui.label()">{{ props.label }}</span>
      <span v-if="props.hint" :class="ui.hint()">{{ props.hint }}</span>
      <span v-if="valueText" :class="ui.value()">{{ valueText }}</span>
    </span>
    <span :class="ui.track()">
      <span
        v-for="(segment, index) in drawn"
        :key="index"
        :class="[ui.fill(), segment.className]"
        :style="{ width: `${segment.width}%` }"
      />
    </span>
    <span v-if="hasLegend" :class="ui.legend()">
      <template v-if="props.legend">
        <span v-for="(segment, index) in legendEntries" :key="index">
          <i :class="[ui.swatch(), segment.className]" aria-hidden="true" />
          {{ segment.label }}
        </span>
      </template>
      <span v-if="slots['legend-end']" class="ms-auto">
        <slot name="legend-end" />
      </span>
    </span>
  </component>
</template>
