<script setup lang="ts">
import { computed } from "vue";

// DMS "health hero" (design .health-hero): a status ring + value next to a
// divided row of key metrics. Generic over any service — API health, DB
// connection, job runner… — and reused across module overviews. Wraps DmsCard
// so it drops straight into a page.
type Status = "ok" | "warn" | "down" | "info";

interface Metric {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: "default" | "error" | "warning" | "success";
}

const props = withDefaults(
  defineProps<{
    statusValue: string;
    status?: Status;
    statusLabel?: string;
    icon?: string;
    metrics?: Metric[];
  }>(),
  {
    status: "ok",
    metrics: () => [],
  },
);

const RING: Record<Status, string> = {
  ok: "border-success/45 bg-success/10 text-success",
  warn: "border-warning/45 bg-warning/10 text-warning",
  down: "border-error/45 bg-error/10 text-error",
  info: "border-info/45 bg-info/10 text-info",
};

const VALUE_TONE: Record<Status, string> = {
  ok: "text-highlighted",
  warn: "text-warning",
  down: "text-error",
  info: "text-info",
};

const METRIC_TONE: Record<NonNullable<Metric["tone"]>, string> = {
  default: "text-highlighted",
  error: "text-error",
  warning: "text-warning",
  success: "text-success",
};

const DEFAULT_ICON: Record<Status, string> = {
  ok: "i-lucide-circle-check",
  warn: "i-lucide-triangle-alert",
  down: "i-lucide-circle-x",
  info: "i-lucide-info",
};

const resolvedIcon = computed(() => props.icon || DEFAULT_ICON[props.status]);
</script>

<template>
  <DmsCard :padded="false" class="p-6 sm:px-7">
    <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
      <div class="flex shrink-0 items-center gap-4">
        <div
          :class="RING[status]"
          class="grid size-16 shrink-0 place-items-center rounded-full border-2"
        >
          <UIcon :name="resolvedIcon" class="size-[30px]" aria-hidden="true" />
        </div>
        <div>
          <p
            v-if="statusLabel"
            class="text-dimmed font-mono text-[10.5px] tracking-[0.14em] uppercase"
          >
            {{ statusLabel }}
          </p>
          <p
            :class="VALUE_TONE[status]"
            class="mt-1 text-[28px] leading-none font-semibold tracking-tight"
          >
            {{ statusValue }}
          </p>
        </div>
      </div>

      <div
        v-if="metrics.length"
        class="border-default hidden self-stretch border-l sm:block"
      />

      <div
        v-if="metrics.length"
        class="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4"
      >
        <div v-for="m in metrics" :key="m.label" class="min-w-0">
          <p
            class="text-dimmed font-mono text-[10px] tracking-[0.12em] uppercase"
          >
            {{ m.label }}
          </p>
          <p
            :class="METRIC_TONE[m.tone || 'default']"
            class="mt-1.5 text-xl font-semibold tabular-nums"
          >
            {{ m.value }}
            <span v-if="m.unit" class="text-dimmed ml-0.5 text-xs font-medium">
              {{ m.unit }}
            </span>
          </p>
          <p v-if="m.sub" class="text-dimmed mt-1 text-[11px]">{{ m.sub }}</p>
        </div>
      </div>
    </div>
  </DmsCard>
</template>
