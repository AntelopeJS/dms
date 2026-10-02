<script setup lang="ts">
import { computed } from "vue";

// DMS "health hero" (design .status-hero): a status ring + value next to a
// divided row of key metrics, optionally over a per-day history strip.
// Generic over any service — API health, DB connection, job runner… — and
// reused across module overviews. Wraps DmsCard so it drops into a page.
type Status = "ok" | "warn" | "down" | "info";

interface Metric {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: "default" | "error" | "warning" | "success";
}

interface StatusTone {
  text: string;
  dot: string;
  tint: string;
  line: string;
}

interface Props {
  statusValue: string;
  status?: Status;
  statusLabel?: string;
  icon?: string;
  metrics?: Metric[];
  /** Mono line under the value, e.g. "Up 14 d 6 h · checked 12 s ago". */
  since?: string;
  /** Pulse the live dot on the ring. */
  live?: boolean;
  /** One status per day, oldest first (a 30-cell strip under the hero). */
  history?: Status[];
  /** Labels under the strip: start, summary, end. */
  historyLabels?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  status: "ok",
  metrics: () => [],
  live: true,
  history: () => [],
  historyLabels: () => [],
});

const STATUS_TONES: Record<Status, StatusTone> = {
  ok: {
    text: "text-success",
    dot: "bg-success",
    tint: "var(--dms-success-tint)",
    line: "var(--dms-success-line)",
  },
  warn: {
    text: "text-warning",
    dot: "bg-warning",
    tint: "var(--dms-warning-tint)",
    line: "var(--dms-warning-line)",
  },
  down: {
    text: "text-error",
    dot: "bg-error",
    tint: "var(--dms-error-tint)",
    line: "var(--dms-error-line)",
  },
  info: {
    text: "text-info",
    dot: "bg-info",
    tint: "var(--dms-info-tint)",
    line: "var(--dms-info-line)",
  },
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

const HISTORY_CELL: Record<Status, string> = {
  ok: "bg-success opacity-75",
  warn: "bg-warning",
  down: "bg-error",
  info: "bg-info opacity-75",
};

const DEFAULT_ICON: Record<Status, string> = {
  ok: "i-ph-check-circle",
  warn: "i-ph-warning",
  down: "i-ph-x-circle",
  info: "i-ph-info",
};

const tone = computed(() => STATUS_TONES[props.status]);
const resolvedIcon = computed(() => props.icon || DEFAULT_ICON[props.status]);

// A faint status wash from the left edge (same recipe as the banner), so the
// state reads at a glance without a coloured border.
const cardStyle = computed(() => ({
  "--dms-status-tint": tone.value.tint,
  "--dms-status-line": tone.value.line,
  background:
    "radial-gradient(420px 180px at 0% 50%, var(--dms-status-tint), transparent 70%), var(--ui-bg)",
}));
</script>

<template>
  <DmsCard
    :padded="false"
    class="px-6 py-[22px] sm:px-[26px]"
    :style="cardStyle"
  >
    <div
      class="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-7"
    >
      <div class="flex shrink-0 items-center gap-4">
        <div
          :class="tone.text"
          class="relative grid size-16 shrink-0 place-items-center rounded-full border-[1.5px] border-(--dms-status-line) bg-(--dms-status-tint) shadow-[0_0_0_6px_color-mix(in_srgb,var(--dms-status-tint)_50%,transparent)]"
        >
          <UIcon :name="resolvedIcon" class="size-[30px]" :aria-hidden="true" />
          <span
            class="absolute top-[3px] right-[3px] size-[11px] rounded-full shadow-[0_0_12px_currentColor] ring-[2.5px] ring-(--ui-bg)"
            :class="tone.dot"
            aria-hidden="true"
          >
            <span
              v-if="live"
              class="absolute inset-0 animate-ping rounded-full [animation-duration:1.8s] motion-reduce:hidden"
              :class="tone.dot"
            />
          </span>
        </div>
        <div>
          <DmsEyebrow v-if="statusLabel" :label="statusLabel" />
          <p
            :class="VALUE_TONE[status]"
            class="mt-1.5 text-[28px] leading-none font-[650] tracking-[-0.035em]"
          >
            {{ statusValue }}
          </p>
          <p v-if="since" class="text-dimmed mt-1.5 font-mono text-[11.5px]">
            {{ since }}
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
        <div
          v-for="(m, index) in metrics"
          :key="m.label"
          class="min-w-0"
          :class="index > 0 && 'sm:border-muted sm:-ml-6 sm:border-l sm:pl-6'"
        >
          <p
            class="text-dimmed font-mono text-[10px] font-semibold tracking-[0.12em] uppercase"
          >
            {{ m.label }}
          </p>
          <p
            :class="METRIC_TONE[m.tone || 'default']"
            class="mt-[7px] font-mono text-xl leading-[1.1] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums"
          >
            {{ m.value }}
            <span
              v-if="m.unit"
              class="text-dimmed ml-0.5 font-sans text-xs font-medium tracking-normal"
            >
              {{ m.unit }}
            </span>
          </p>
          <p v-if="m.sub" class="text-dimmed mt-1 truncate text-[11.5px]">
            {{ m.sub }}
          </p>
        </div>
      </div>

      <div
        v-if="history.length"
        class="border-muted grid basis-full gap-2 border-t pt-4"
      >
        <div
          class="grid h-[26px] gap-[3px]"
          :style="{ gridTemplateColumns: `repeat(${history.length}, 1fr)` }"
        >
          <span
            v-for="(day, index) in history"
            :key="index"
            class="rounded-[2px]"
            :class="HISTORY_CELL[day]"
          />
        </div>
        <div
          v-if="historyLabels.length"
          class="text-dimmed flex justify-between font-mono text-[11px]"
        >
          <span v-for="label in historyLabels" :key="label">{{ label }}</span>
        </div>
      </div>
    </div>
  </DmsCard>
</template>
