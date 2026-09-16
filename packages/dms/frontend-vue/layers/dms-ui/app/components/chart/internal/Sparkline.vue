<script setup lang="ts">
import { computed, useId } from "vue";

interface Props {
  values: number[];
  accent?: string;
  ariaLabel?: string;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 30;
const STROKE_WIDTH = 1.5;
const END_DOT_RADIUS = 1.6;
const COORDINATE_PRECISION = 2;
const PADDING = 1;
const GRADIENT_TOP_OPACITY = 0.25;
const GRADIENT_BOTTOM_OPACITY = 0;
const DEFAULT_ARIA_LABEL = "Trend";

// All accents resolve through the theme tokens (cf. primary), so sparklines
// follow the design palette + light/dark mode instead of raw RGB.
const STROKE_BY_ACCENT: Record<string, string> = {
  success: "var(--ui-success)",
  error: "var(--ui-error)",
  primary: "var(--ui-primary)",
  info: "var(--ui-info)",
  neutral: "var(--ui-text-toned)",
};

const props = withDefaults(defineProps<Props>(), {
  accent: "primary",
});

const uid = useId();
const gradientId = `dms-spark-grad-${uid}`;

const stroke = computed(
  () => STROKE_BY_ACCENT[props.accent] ?? STROKE_BY_ACCENT.primary!,
);

const coords = computed(() => {
  const values = props.values;
  if (values.length === 0) return [] as Array<{ x: number; y: number }>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const denom = values.length > 1 ? values.length - 1 : 1;
  return values.map((value, index) => ({
    x: (index / denom) * VIEWBOX_WIDTH,
    y:
      VIEWBOX_HEIGHT -
      ((value - min) / span) * (VIEWBOX_HEIGHT - PADDING * 2) -
      PADDING,
  }));
});

function formatPoint(point: { x: number; y: number }): string {
  return `${point.x.toFixed(COORDINATE_PRECISION)},${point.y.toFixed(COORDINATE_PRECISION)}`;
}

const points = computed(() => coords.value.map(formatPoint).join(" "));

const areaPoints = computed(() => {
  if (coords.value.length === 0) return "";
  const line = coords.value.map(formatPoint).join(" ");
  const last = coords.value[coords.value.length - 1]!;
  const first = coords.value[0]!;
  return `${first.x.toFixed(COORDINATE_PRECISION)},${VIEWBOX_HEIGHT} ${line} ${last.x.toFixed(COORDINATE_PRECISION)},${VIEWBOX_HEIGHT}`;
});

const lastPoint = computed(() => coords.value[coords.value.length - 1] ?? null);
</script>

<template>
  <svg
    :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`"
    preserveAspectRatio="none"
    class="block h-full w-full overflow-visible"
    role="img"
    :aria-label="ariaLabel || DEFAULT_ARIA_LABEL"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" x2="0" y1="0" y2="1">
        <stop
          offset="0%"
          :stop-color="stroke"
          :stop-opacity="GRADIENT_TOP_OPACITY"
        />
        <stop
          offset="100%"
          :stop-color="stroke"
          :stop-opacity="GRADIENT_BOTTOM_OPACITY"
        />
      </linearGradient>
    </defs>
    <polygon
      v-if="areaPoints"
      :points="areaPoints"
      :fill="`url(#${gradientId})`"
    />
    <polyline
      v-if="points"
      :points="points"
      :stroke="stroke"
      :stroke-width="STROKE_WIDTH"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
    <circle
      v-if="lastPoint"
      :cx="lastPoint.x"
      :cy="lastPoint.y"
      :r="END_DOT_RADIUS"
      :fill="stroke"
    />
  </svg>
</template>
