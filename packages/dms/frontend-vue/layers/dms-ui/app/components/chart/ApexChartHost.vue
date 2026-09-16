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
  <ApexChart
    ref="chartRef"
    :type="apexType"
    :height="height"
    :options="pinnedOptions"
    :series="series"
  />
</template>
