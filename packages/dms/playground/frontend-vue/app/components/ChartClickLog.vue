<script setup lang="ts">

interface Props {
  title: string;
  hint: string;
}

interface ChartClickData {
  seriesName?: string;
  label?: string;
  value?: number | null;
  values?: number[];
  dataPointIndex?: number;
}

interface ChartClickDetail {
  component?: string;
  data?: ChartClickData;
}

interface ClickEntry {
  id: number;
  event: string;
  text: string;
}

defineProps<Props>();

const CHART_EVENTS = [
  "DmsComponent.Chart.SegmentClick",
  "DmsComponent.Chart.PointClick",
];
const MAX_ENTRIES = 6;
const EVENT_PREFIX = "DmsComponent.Chart.";

const entries = ref<ClickEntry[]>([]);
let nextId = 0;

function describe(data: ChartClickData | undefined): string {
  const value = data?.values ? data.values.join(" / ") : data?.value;
  const where = data?.label ?? `#${data?.dataPointIndex ?? "?"}`;
  return `${data?.seriesName ?? "?"} · ${where} · ${value ?? "—"}`;
}

function onChartEvent(event: Event): void {
  const detail = (event as CustomEvent<ChartClickDetail>).detail;
  nextId += 1;
  entries.value = [
    {
      id: nextId,
      event: event.type.replace(EVENT_PREFIX, ""),
      text: describe(detail?.data),
    },
    ...entries.value,
  ].slice(0, MAX_ENTRIES);
}

onMounted(() => {
  CHART_EVENTS.forEach((name) => window.addEventListener(name, onChartEvent));
});

onBeforeUnmount(() => {
  CHART_EVENTS.forEach((name) =>
    window.removeEventListener(name, onChartEvent),
  );
});
</script>

<template>
  <DmsCard :title="title" :count="entries.length">
    <p v-if="!entries.length" class="text-sm text-muted">
      {{ hint }}
    </p>
    <ul v-else class="flex flex-col gap-1 font-mono text-xs">
      <li v-for="entry in entries" :key="entry.id">
        <span class="text-primary">{{ entry.event }}</span>
        {{ entry.text }}
      </li>
    </ul>
  </DmsCard>
</template>
