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
// Resolved once: the frame does not change after the page is laid out.
const Wrapper = props.framed ? resolveComponent("DmsCard") : "div";
</script>

<template>
  <component :is="Wrapper">
    <div v-if="showSkeleton" class="grid gap-2" aria-busy="true">
      <USkeleton class="h-3 w-1/3 bg-(--dms-skeleton)" />
      <USkeleton class="h-1.5 w-full bg-(--dms-skeleton)" />
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
