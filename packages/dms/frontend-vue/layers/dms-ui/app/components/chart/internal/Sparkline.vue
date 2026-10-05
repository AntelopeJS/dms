<script setup lang="ts">
import { computed, useId } from "vue";
import {
  closeSparkArea,
  projectSparkPoints,
  smoothSparkPath,
} from "../../../composables/chart/sparklinePath";

type SparklineArea = "gradient" | "flat" | "none";

interface Props {
  values: number[];
  accent?: string;
  ariaLabel?: string;
  /**
   * "gradient" fades the area 26% → 0 (KPI), "flat" is a quiet 12% wash
   * (lists), "none" draws the line alone (table cells).
   */
  area?: SparklineArea;
  showDot?: boolean;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 30;
const PADDING = 3;
const STROKE_WIDTH = 2;
const GRADIENT_TOP_OPACITY = 0.26;
const GRADIENT_BOTTOM_OPACITY = 0;
const FLAT_AREA_OPACITY = 0.12;
const PERCENT = 100;
const DEFAULT_ARIA_LABEL = "Trend";

// Accents resolve through theme tokens so sparklines follow light/dark mode;
// primary is the v2 sparkline cyan, deeper than the fill cyan on white.
const STROKE_BY_ACCENT: Record<string, string> = {
  primary: "var(--dms-sparkline)",
  secondary: "var(--ui-secondary)",
  success: "var(--ui-success)",
  error: "var(--ui-error)",
  warning: "var(--ui-warning)",
  info: "var(--ui-info)",
  neutral: "var(--ui-text-muted)",
};

const props = withDefaults(defineProps<Props>(), {
  accent: "primary",
  area: "gradient",
  showDot: true,
});

const gradientId = `dms-spark-grad-${useId()}`;

const stroke = computed(
  () => STROKE_BY_ACCENT[props.accent] ?? STROKE_BY_ACCENT.primary!,
);

const points = computed(() =>
  projectSparkPoints(props.values, {
    width: VIEWBOX_WIDTH,
    height: VIEWBOX_HEIGHT,
    padding: PADDING,
  }),
);

const linePath = computed(() => smoothSparkPath(points.value));
const areaPath = computed(() =>
  closeSparkArea(linePath.value, points.value, VIEWBOX_HEIGHT),
);

const areaFill = computed(() =>
  props.area === "flat" ? stroke.value : `url(#${gradientId})`,
);
const areaOpacity = computed(() =>
  props.area === "flat" ? FLAT_AREA_OPACITY : undefined,
);

// The end dot is HTML over the stretched SVG, so it stays round at any size.
const dotStyle = computed(() => {
  const last = points.value[points.value.length - 1];
  if (!props.showDot || !last) return null;
  return {
    left: `${(last.x / VIEWBOX_WIDTH) * PERCENT}%`,
    top: `${(last.y / VIEWBOX_HEIGHT) * PERCENT}%`,
    background: stroke.value,
  };
});
</script>

<template>
  <div class="relative h-full w-full">
    <svg
      :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`"
      preserveAspectRatio="none"
      class="block h-full w-full overflow-visible"
      role="img"
      :aria-label="ariaLabel || DEFAULT_ARIA_LABEL"
    >
      <defs v-if="area === 'gradient'">
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
      <path
        v-if="areaPath && area !== 'none'"
        :d="areaPath"
        :fill="areaFill"
        :fill-opacity="areaOpacity"
      />
      <path
        v-if="linePath"
        :d="linePath"
        :stroke="stroke"
        :stroke-width="STROKE_WIDTH"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span
      v-if="dotStyle"
      class="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-(--ui-bg)"
      :style="dotStyle"
      aria-hidden="true"
    />
  </div>
</template>
