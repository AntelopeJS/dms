<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  markRaw,
  onMounted,
  ref,
  shallowRef,
  toRaw,
  watch,
  type Component,
} from "vue";
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

interface ApexChartInstance {
  updateOptions: (
    options: Record<string, unknown>,
    redrawPaths?: boolean,
    animate?: boolean,
    updateSyncedCharts?: boolean,
  ) => Promise<unknown>;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const REDRAW_PATHS = false;
const ANIMATE = true;
const UPDATE_SYNCED_CHARTS = false;

const { locale } = useI18n();

// ApexCharts stays a lazy chunk: the caller (Chart) keeps the chart's frame
// and a skeleton until this host reports the chart drawn.
const ApexChart = defineAsyncComponent(async () => {
  const [mod] = await Promise.all([
    import("vue3-apexcharts"),
    import("apexcharts"),
    ensureApexLocale(locale.value),
  ]);
  return (mod.default ?? mod) as unknown as Component;
});

onMounted(() => {
  void ensureApexLocale(locale.value).catch(() => undefined);
});

const chartRef = ref<ApexChartInstance | null>(null);

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
  const raw = toRaw(value) as unknown;
  if (Array.isArray(raw)) return raw.map((entry) => toApexInput(entry)) as T;
  if (raw && typeof raw === "object" && !(raw instanceof Date)) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(raw)) {
      copy[key] = toApexInput(entry);
    }
    return copy as T;
  }
  return raw as T;
}

function rawApexInput<T extends object>(value: T): T {
  return markRaw(toApexInput(value));
}

const apexSeries = computed(() =>
  rawApexInput((props.series ?? []) as unknown[]),
);

// The wrapper's reactive options update JSON-clones away formatter callbacks.
const pinnedOptions = shallowRef<Record<string, unknown>>(
  rawApexInput(props.options),
);

function pushOptionsWithoutGroupBroadcast(
  instance: ApexChartInstance,
  next: Record<string, unknown>,
): void {
  void instance
    .updateOptions(
      rawApexInput(next),
      REDRAW_PATHS,
      ANIMATE,
      UPDATE_SYNCED_CHARTS,
    )
    .catch(() => undefined);
}

watch(
  () => props.options,
  (next) => {
    const instance = chartRef.value;
    if (!instance) {
      pinnedOptions.value = rawApexInput(next);
      return;
    }
    pushOptionsWithoutGroupBroadcast(instance, next);
  },
);

function onDrawn() {
  emit("drawn");
}
</script>

<template>
  <div class="dms-apex">
    <ApexChart
      ref="chartRef"
      :type="apexType"
      :height="height"
      :options="pinnedOptions"
      :series="apexSeries"
      @mounted="onDrawn"
      @updated="onDrawn"
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
