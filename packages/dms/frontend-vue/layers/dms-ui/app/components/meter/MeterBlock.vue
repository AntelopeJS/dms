<script setup lang="ts">
import { computed, resolveComponent } from "vue";
import DmsMeter, {
  type MeterFormat,
  type MeterSegment,
  type MeterSize,
  type MeterTone,
} from "./Meter.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
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
// data source, optionally framed as a card. DmsMeter draws it.
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
  /** Wraps the meter in a padded card. */
  framed?: boolean;
  /** Legend link pushed right ("Manage members"). */
  linkLabel?: string;
  linkTo?: string;
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
  tone: "accent",
  warnAt: undefined,
  errorAt: undefined,
  size: "sm",
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  framed: false,
  linkLabel: undefined,
  linkTo: undefined,
});

const { processI18n } = useTranslation();

const { data, isLoading } = useChartFetch<MeterResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
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
  () => props.legend || !!(props.linkLabel && props.linkTo),
);
// Resolved once: the frame does not change after the page is laid out.
const Wrapper = props.framed ? resolveComponent("DmsCard") : "div";
</script>

<template>
  <component :is="Wrapper">
    <div v-if="showSkeleton" class="grid min-w-0 gap-1.5" aria-busy="true">
      <span class="flex h-5 min-w-0 items-center gap-2 text-[13px]">
        <span v-if="props.label" class="text-toned">
          {{ translate(props.label) }}
        </span>
        <USkeleton v-else class="h-3 w-1/3 bg-(--dms-skeleton)" />
        <USkeleton class="ms-auto h-3 w-12 bg-(--dms-skeleton)" />
      </span>
      <USkeleton
        class="w-full rounded-full bg-(--dms-skeleton)"
        :class="skeletonTrackClass"
      />
      <span v-if="skeletonHasLegend" class="flex h-4 items-center">
        <USkeleton class="h-2.5 w-40 bg-(--dms-skeleton)" />
      </span>
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
      <template v-if="props.linkLabel && props.linkTo" #legend-end>
        <DmsLink
          :to="props.linkTo"
          class="text-primary text-xs font-medium hover:underline"
        >
          {{ processI18n(props.linkLabel) }}
        </DmsLink>
      </template>
    </DmsMeter>
  </component>
</template>
