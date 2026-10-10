<script setup lang="ts">
import { computed, resolveComponent } from "vue";
import DmsMeter, {
  type MeterFormat,
  type MeterSegment,
  type MeterSize,
  type MeterTone,
} from "./Meter.vue";
import DmsBlockActions, {
  type BlockAction,
} from "../../build/components/blocks/BlockActions.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

/** What a meter's data source answers: any subset of its figures. */
interface MeterResponse {
  value?: number;
  max?: number;
  segments?: MeterSegment[];
  hint?: string;
  valueLabel?: string;
}

// The page block behind the backend `Meter` builder: static figures or a
// data source, optionally in a card. DmsMeter draws it.
interface MeterBlockProps extends DefaultComponentProps {
  label?: string;
  hint?: string;
  value?: number;
  max?: number;
  segments?: MeterSegment[];
  legend?: boolean;
  format?: MeterFormat;
  valueLabel?: string;
  tone?: MeterTone;
  warnAt?: number;
  errorAt?: number;
  size?: MeterSize;
  /** Endpoint answering `{ value?, max?, segments?, hint?, valueLabel? }`. */
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /** Id of the PeriodSelector the data follows. */
  periodScope?: string;
  /** Topics whose events make the block read `fetchUrl` again. */
  realtimeTopic?: string | string[];
  /** Wraps the meter in a padded card. */
  card?: boolean;
  /** Link buttons pushed right of the legend ("Manage members"). */
  actions?: BlockAction[];
}

const props = withDefaults(defineProps<MeterBlockProps>(), {
  label: undefined,
  hint: undefined,
  value: undefined,
  max: undefined,
  segments: undefined,
  legend: false,
  format: "fraction",
  valueLabel: undefined,
  tone: "primary",
  warnAt: undefined,
  errorAt: undefined,
  size: "sm",
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  periodScope: undefined,
  realtimeTopic: undefined,
  card: false,
  actions: () => [],
});

const { processI18n } = useTranslation();
const { t } = useI18n();

const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);

const { data, isLoading, error, refresh } = useChartFetch<MeterResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  periodScope: props.periodScope,
  realtimeTopic: props.realtimeTopic,
  routeParams: () => props.routeParams,
  watchSource: () => JSON.stringify(watchState.value),
});

const translate = (text: string | undefined): string | undefined =>
  text ? processI18n(text) : undefined;

const figures = computed(() => {
  const fetched = data.value ?? {};
  return {
    value: fetched.value ?? props.value ?? 0,
    max: fetched.max ?? props.max ?? 100,
    hint: translate(fetched.hint ?? props.hint),
    valueLabel: translate(fetched.valueLabel ?? props.valueLabel),
    segments: (fetched.segments ?? props.segments)?.map((segment) => ({
      ...segment,
      label: translate(segment.label),
    })),
  };
});

const showSkeleton = computed(() => isLoading.value && !data.value);
// v2 error state, as on a KPI card: a failed first load shows a message and
// a retry button in place of the bar, never default figures (`0 / 100`); a
// failed refetch keeps the last figures.
const hasError = computed(
  () => !isLoading.value && !data.value && Boolean(error.value),
);
// The placeholder is the meter's own shape: the label line (the label is
// configuration, shown as is), the bar at its size, the legend line.
const SKELETON_TRACK_HEIGHTS: Record<string, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
};
const skeletonTrackClass = computed(
  () => SKELETON_TRACK_HEIGHTS[props.size] ?? SKELETON_TRACK_HEIGHTS.sm,
);
const skeletonHasLegend = computed(
  () => props.legend || props.actions.length > 0,
);
// Resolved once: the frame does not change after the page is laid out.
const Wrapper = props.card ? resolveComponent("DmsCard") : "div";
</script>

<template>
  <component :is="Wrapper">
    <div v-if="showSkeleton" class="grid min-w-0 gap-1.5" aria-busy="true">
      <span class="flex h-5 min-w-0 items-center gap-2 text-[13px]">
        <span v-if="props.label" class="text-toned">
          {{ translate(props.label) }}
        </span>
        <USkeleton v-else class="h-3 w-1/3" />
        <USkeleton class="ms-auto h-3 w-12" />
      </span>
      <USkeleton class="w-full rounded-full" :class="skeletonTrackClass" />
      <span v-if="skeletonHasLegend" class="flex h-4 items-center">
        <USkeleton class="h-2.5 w-40" />
      </span>
    </div>
    <div v-else-if="hasError" class="grid min-w-0 gap-1.5" role="alert">
      <span v-if="props.label" class="text-toned text-[13px]">
        {{ translate(props.label) }}
      </span>
      <div class="flex items-center justify-between gap-2">
        <p class="text-error flex min-w-0 items-center gap-1.5 text-[12.5px]">
          <UIcon name="i-ph-warning-circle" class="size-4 shrink-0" />
          <span class="truncate">{{ t("dms.table.load_error_title") }}</span>
        </p>
        <UButton
          :label="t('dms.table.load_error_retry')"
          icon="i-ph-arrows-clockwise"
          color="neutral"
          variant="outline"
          size="xs"
          @click="refresh()"
        />
      </div>
    </div>
    <DmsMeter
      v-else
      :label="translate(props.label)"
      :hint="figures.hint"
      :value="figures.value"
      :max="figures.max"
      :segments="figures.segments"
      :legend="props.legend"
      :format="props.format"
      :value-label="figures.valueLabel"
      :tone="props.tone"
      :warn-at="props.warnAt"
      :error-at="props.errorAt"
      :size="props.size"
    >
      <template v-if="props.actions.length" #legend-end>
        <DmsBlockActions
          :actions="props.actions"
          size="xs"
          lead-variant="link"
          rest-variant="link"
        />
      </template>
    </DmsMeter>
  </component>
</template>
