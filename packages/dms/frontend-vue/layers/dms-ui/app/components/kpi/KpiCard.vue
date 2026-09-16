<script setup lang="ts">
import { computed } from "vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { formatValueParts } from "../../composables/chart/formatValue";
import { resolveSparklineAccent } from "../../composables/chart/resolveSparklineAccent";
import type {
  KpiCardResponse,
  ValueFormat,
  ValuePrecision,
} from "../../composables/chart/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface Props extends DefaultComponentProps {
  title: string;
  /** "stat" = compact DMS v2 look: mono uppercase label, bare small icon. */
  variant?: "default" | "stat";
  description?: string;
  icon?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showDelta?: boolean;
  showSparkline?: boolean;
  sparklineAccent?: string;
  invert?: boolean;
  compareLabel?: string;
  staticValue?: number;
  staticDelta?: number;
  staticSparkline?: number[];
}

const DEFAULT_FALLBACK_ICON = "i-lucide-bar-chart-3";

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
  showDelta: true,
  showSparkline: false,
  valueFormat: "compact",
  sparklineAccent: "auto",
  currencyCode: "EUR",
});

const { locale } = useI18n();
const { processI18n } = useTranslation();
useComponentEvent(props.componentId);
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);
const watchKey = computed(() => JSON.stringify(watchState.value));

const staticData = computed<KpiCardResponse | null>(() => {
  if (props.staticValue === undefined) return null;
  return {
    value: props.staticValue,
    delta: props.staticDelta,
    sparkline: props.staticSparkline,
  };
});

const { data, isLoading } = useChartFetch<KpiCardResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  periodScope: props.periodScope,
  staticData: () => staticData.value,
  watchSource: () => watchKey.value,
});

const value = computed(() => data.value?.value ?? 0);
const delta = computed(() => data.value?.delta ?? null);
const sparkline = computed(() => data.value?.sparkline ?? []);

const formattedParts = computed(() =>
  formatValueParts(
    value.value,
    props.valueFormat,
    locale.value,
    props.currencyCode,
    props.valuePrecision,
  ),
);

const showTrend = computed(() => props.showDelta && delta.value !== null);

const resolvedSparklineAccent = computed(() =>
  resolveSparklineAccent(props.sparklineAccent, {
    delta: delta.value,
    sparkline: sparkline.value,
    invert: props.invert,
  }),
);

const resolvedIcon = computed(() => props.icon || DEFAULT_FALLBACK_ICON);

const isStat = computed(() => props.variant === "stat");
const labelClass = computed(() =>
  isStat.value
    ? "text-dimmed truncate font-mono text-[10px] font-medium uppercase tracking-widest"
    : "text-muted truncate text-sm",
);
const iconWrapClass = computed(() =>
  isStat.value
    ? "text-dimmed flex shrink-0 items-center justify-center"
    : "bg-elevated dark:bg-accented text-toned flex shrink-0 items-center justify-center rounded-lg p-2",
);
</script>

<template>
  <DmsCard :padded="false" class="p-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p :class="labelClass">{{ processI18n(title) }}</p>
        <p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
          <USkeleton v-if="isLoading && data === null" class="h-8 w-24" />
          <span v-else class="inline-flex items-baseline gap-x-1">
            <span
              v-if="formattedParts.unit && formattedParts.unitIsPrefix"
              class="text-muted text-base font-medium"
            >
              {{ formattedParts.unit }}
            </span>
            <span>{{ formattedParts.value }}</span>
            <span
              v-if="formattedParts.unit && !formattedParts.unitIsPrefix"
              class="text-muted text-base font-medium"
            >
              {{ formattedParts.unit }}
            </span>
          </span>
        </p>
        <div
          v-if="showTrend || compareLabel || description"
          class="mt-2 flex min-w-0 items-center gap-x-2"
        >
          <DmsTrendBadge v-if="showTrend" :delta="delta" :invert="invert" />
          <span v-if="compareLabel" class="text-muted truncate text-xs">
            {{ processI18n(compareLabel) }}
          </span>
          <span v-else-if="description" class="text-muted truncate text-xs">
            {{ processI18n(description) }}
          </span>
        </div>
      </div>
      <div :class="iconWrapClass">
        <UIcon
          :name="resolvedIcon"
          :class="isStat ? 'size-4' : 'size-5'"
          aria-hidden="true"
        />
      </div>
    </div>
    <div v-if="showSparkline && sparkline.length > 0" class="mt-4 h-10">
      <DmsSparkline
        :values="sparkline"
        :accent="resolvedSparklineAccent"
        :aria-label="processI18n(title)"
      />
    </div>
  </DmsCard>
</template>
