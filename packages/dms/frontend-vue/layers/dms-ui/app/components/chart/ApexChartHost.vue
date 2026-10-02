<script setup lang="ts">
import {
  defineAsyncComponent,
  onMounted,
  ref,
  shallowRef,
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

interface ApexChartInstance {
  updateOptions: (
    options: Record<string, unknown>,
    redrawPaths?: boolean,
    animate?: boolean,
    updateSyncedCharts?: boolean,
  ) => Promise<unknown>;
}

const props = defineProps<Props>();

const REDRAW_PATHS = false;
const ANIMATE = true;
const UPDATE_SYNCED_CHARTS = false;

const { locale } = useI18n();

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

// The wrapper's reactive options update JSON-clones away formatter callbacks.
const pinnedOptions = shallowRef<Record<string, unknown>>({ ...props.options });

function pushOptionsWithoutGroupBroadcast(
  instance: ApexChartInstance,
  next: Record<string, unknown>,
): void {
  void instance
    .updateOptions(next, REDRAW_PATHS, ANIMATE, UPDATE_SYNCED_CHARTS)
    .catch(() => undefined);
}

watch(
  () => props.options,
  (next) => {
    const instance = chartRef.value;
    if (!instance) {
      pinnedOptions.value = { ...next };
      return;
    }
    pushOptionsWithoutGroupBroadcast(instance, next);
  },
);
</script>

<template>
  <div class="dms-apex">
    <ApexChart
      ref="chartRef"
      :type="apexType"
      :height="height"
      :options="pinnedOptions"
      :series="series"
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
