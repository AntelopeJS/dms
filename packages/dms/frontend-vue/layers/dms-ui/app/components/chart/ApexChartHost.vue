<script setup lang="ts">
import { isObject } from "../../../../dms-core/app/utils/type-check";
import {
  computed,
  defineAsyncComponent,
  markRaw,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toRaw,
  watch,
  type Component,
} from "vue";
import type { VueApexChartsComponentMethods } from "vue3-apexcharts";
import { ensureApexLocale } from "../../composables/chart/apexLocales";

interface Props {
  apexType: string;
  height: number | string;
  options: Record<string, unknown>;
  series: unknown;
}

interface Emits {
  /** Apex has drawn the chart: the caller's placeholder can go. */
  (event: "drawn"): void;
}

/** The ApexCharts instance the wrapper exposes as `chart`. */
interface ApexCore {
  /**
   * Apex's (debounced) redraw at the container width, the one its parent
   * resize observer starts. Unlike its window resize handler it does not
   * read `chart.redrawOnWindowResize`, which only opts out of window resizes.
   */
  _windowResize: () => void;
  /** Apex's state: `animationEnded` is false while the chart is animating. */
  w: { globals: { animationEnded: boolean } };
}

interface ApexChartInstance {
  chart: ApexCore | null;
  updateOptions: VueApexChartsComponentMethods["updateOptions"];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const REDRAW_PATHS = false;
const ANIMATE = true;
const UPDATE_SYNCED_CHARTS = false;
const WIDTH_TOLERANCE_PX = 1;

const { locale } = useI18n();

const ApexChart = defineAsyncComponent<Component>(async () => {
  const [mod] = await Promise.all([
    import("vue3-apexcharts"),
    import("apexcharts"),
    ensureApexLocale(locale.value),
  ]);
  return mod.default ?? mod;
});

const hostRef = ref<HTMLElement | null>(null);
const chartRef = ref<ApexChartInstance | null>(null);
let hostResizes: ResizeObserver | undefined;

onMounted(() => {
  void ensureApexLocale(locale.value).catch(() => undefined);
  if (!hostRef.value) return;
  hostResizes = new ResizeObserver(redrawIfResizedWhileIdle);
  hostResizes.observe(hostRef.value);
});

onBeforeUnmount(() => {
  hostResizes?.disconnect();
});

/**
 * A plain, non-reactive copy of a value handed to Apex. Apex writes into the
 * series and options it is given, and the wrapper deep-watches its `series`
 * prop: a reactive series (fetched data, a card's reactive context) turns
 * each of Apex's own writes into another update, until Vue gives up with
 * "Maximum recursive updates". A copy Apex may scribble on, marked raw so the
 * deep watcher only reacts to a new series, breaks that loop. Functions
 * (formatters, event handlers) and dates are kept as they are.
 */
function toApexInput<T>(value: T): T {
  const raw = toRaw(value);
  if (Array.isArray(raw)) {
    return raw.map((entry) => toApexInput(entry)) as T;
  }
  if (raw && isObject(raw) && !(raw instanceof Date)) {
    const copy: Props["options"] = {};
    for (const [key, entry] of Object.entries(raw)) {
      copy[key] = toApexInput(entry);
    }
    return copy as T;
  }
  return raw;
}

function rawApexInput<T extends object>(value: T): T {
  return markRaw(toApexInput(value));
}

const apexSeries = computed(() => rawApexInput(props.series ?? []));

/**
 * The options handed to Apex, its parent resize observer off. That observer
 * redraws on any change of the host's size, height included, and a circular
 * chart changes the height itself: Apex draws it at its configured height,
 * then fits its box to the ring and legend, and the redraw that resize starts
 * draws it at the configured height again. The donut redraws every 150ms or
 * so for as long as the page is open, and a screenshot taken mid-redraw
 * shows the ring off centre. The host redraws on width changes instead.
 */
function apexOptions(options: Props["options"]): Props["options"] {
  const chart = isObject(options.chart) ? options.chart : {};
  return rawApexInput({
    ...options,
    chart: { ...chart, redrawOnParentResize: false },
  });
}

const pinnedOptions = shallowRef<Props["options"]>(apexOptions(props.options));

function pushOptionsWithoutGroupBroadcast(
  instance: ApexChartInstance,
  next: Props["options"],
): void {
  void instance
    .updateOptions(
      apexOptions(next),
      REDRAW_PATHS,
      ANIMATE,
      UPDATE_SYNCED_CHARTS,
    )
    .catch(() => undefined);
}

function axisTypeOf(options: Props["options"]) {
  return (options.xaxis as { type?: unknown } | undefined)?.type;
}

/**
 * Apex merges an update into the options it holds: an option the update no
 * longer sets stays. A category axis drawing calendar buckets carries its own
 * label and tooltip formatters, which a datetime axis would keep writing raw
 * timestamps with (and the reverse leaves Apex's datetime state behind), so a
 * chart whose X axis changes type is drawn anew rather than updated.
 */
const axisType = computed(() => String(axisTypeOf(props.options) ?? ""));

watch(
  () => props.options,
  (next, previous) => {
    const instance = chartRef.value;
    if (!instance || axisTypeOf(next) !== axisTypeOf(previous)) {
      pinnedOptions.value = apexOptions(next);
      return;
    }
    pushOptionsWithoutGroupBroadcast(instance, next);
  },
);

function onDrawn() {
  emit("drawn");
}

function isDrawnAtStaleWidth(host: HTMLElement): boolean {
  const svg = host.querySelector("svg.apexcharts-svg");
  if (!svg) return false;
  const drawnWidth = svg.getBoundingClientRect().width;
  const hostWidth = host.getBoundingClientRect().width;
  return Math.abs(drawnWidth - hostWidth) > WIDTH_TOLERANCE_PX;
}

/**
 * Apex drops its container's resizes while an animation runs, so a sidebar
 * collapsed or expanded during one leaves the chart at its old width, past
 * its card when the container shrank, until the next window resize. Once the
 * animation is over, a chart drawn at another width than its host redraws.
 */
function redrawIfResizedWhileAnimating() {
  const host = hostRef.value;
  const chart = chartRef.value?.chart;
  if (!host || !chart || !isDrawnAtStaleWidth(host)) return;
  chart._windowResize();
}

/**
 * The host's own resize observer, in place of Apex's: a chart drawn at
 * another width than its host redraws, and a change of height alone, such as
 * the one a circular chart makes when it fits its box, redraws nothing. While
 * an animation runs the redraw waits for its end.
 */
function redrawIfResizedWhileIdle() {
  if (chartRef.value?.chart?.w.globals.animationEnded !== true) return;
  redrawIfResizedWhileAnimating();
}
</script>

<template>
  <div ref="hostRef" class="dms-apex">
    <ApexChart
      :key="axisType"
      ref="chartRef"
      :type="apexType"
      :height="height"
      :options="pinnedOptions"
      :series="apexSeries"
      @mounted="onDrawn"
      @updated="onDrawn"
      @animation-end="redrawIfResizedWhileAnimating"
    />
  </div>
</template>

<style>
/* Apex renders its tooltip and legend as plain DOM: they are restyled here
   as the v2 menu surface (mono eyebrow title, mono values, square keys).
   The doubled class outranks Apex's injected light-theme rules. */
.dms-apex .apexcharts-tooltip.apexcharts-tooltip {
  min-width: 150px;
  padding: 8px 0 6px;
  border: 1px solid var(--ui-border-accented);
  border-radius: calc(var(--ui-radius) * 1.5);
  background: var(--ui-bg);
  box-shadow: var(--shadow-lg);
  color: var(--ui-text);
  font-size: 12px;
}
.dms-apex .apexcharts-tooltip.apexcharts-tooltip .apexcharts-tooltip-title {
  margin: 0;
  padding: 0 10px 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text-dimmed);
  font-family: var(--font-mono) !important;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.dms-apex
  .apexcharts-tooltip.apexcharts-tooltip
  .apexcharts-tooltip-series-group {
  gap: 8px;
  padding: 0 10px;
}
.dms-apex .apexcharts-tooltip.apexcharts-tooltip .apexcharts-tooltip-y-group {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 2px 0;
}
.dms-apex
  .apexcharts-tooltip.apexcharts-tooltip
  .apexcharts-tooltip-text-y-label {
  color: var(--ui-text-muted);
}
.dms-apex
  .apexcharts-tooltip.apexcharts-tooltip
  .apexcharts-tooltip-text-y-value {
  margin-left: 0;
  color: var(--ui-text-highlighted);
  font-family: var(--font-mono) !important;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dms-apex .apexcharts-tooltip.apexcharts-tooltip .apexcharts-tooltip-marker {
  width: 8px;
  height: 8px;
  margin: 0;
  flex: none;
  border-radius: 2.5px;
  background: currentColor;
}
.dms-apex
  .apexcharts-tooltip.apexcharts-tooltip
  .apexcharts-tooltip-marker::before {
  content: none;
}
/* Donut centre label as a mono eyebrow (Apex has no text-transform). */
.dms-apex .apexcharts-pie .apexcharts-datalabel-label {
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.dms-apex .apexcharts-legend-text {
  color: var(--ui-text-muted) !important;
}
.dms-apex .apexcharts-legend-marker {
  margin-right: 6px;
  overflow: hidden;
  border-radius: 2.5px;
}
</style>
