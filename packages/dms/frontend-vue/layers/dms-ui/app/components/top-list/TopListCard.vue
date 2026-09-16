<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { formatValue } from "../../composables/chart/formatValue";
import { resolveSparklineAccent } from "../../composables/chart/resolveSparklineAccent";
import { usePeriodScope } from "#dms-core/app/composables/period/usePeriodScope";
import type {
  TopListCardResponse,
  TopListItem,
  UiColor,
  ValueFormat,
  ValuePrecision,
} from "../../composables/chart/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface Props extends DefaultComponentProps {
  title: string;
  description?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showRank?: boolean;
  highlightTopN?: number;
  rankColor?: UiColor;
  showDelta?: boolean;
  showSparkline?: boolean;
  sparklineAccent?: string;
  invert?: boolean;
  badgeColor?: UiColor;
  maxHeight?: string;
  staticItems?: TopListItem[];
  emptyLabel?: string;
}

const RANK_PAD_WIDTH = 2;
const DEFAULT_MAX_HEIGHT = "24rem";
const EMPTY_STATE_MIN_HEIGHT = "12rem";
const DEFAULT_HIGHLIGHT_TOP_N = 3;
const SKELETON_ROW_COUNT = 5;
const PRESET_LABEL_KEY_PREFIX = "dms.period.presets";
const EMPTY_LABEL_FALLBACK_KEY = "dms.top_list.empty";
const EMPTY_LABEL_FALLBACK_TEXT = "No data";
const MUTED_RANK_CLASS = "text-muted";

const RANK_HIGHLIGHT_CLASSES: Record<string, string> = {
  primary: "text-primary font-semibold",
  secondary: "text-secondary font-semibold",
  info: "text-info font-semibold",
  success: "text-success font-semibold",
  warning: "text-warning font-semibold",
  error: "text-error font-semibold",
  neutral: "text-toned font-semibold",
};

const props = withDefaults(defineProps<Props>(), {
  showRank: true,
  showDelta: true,
  showSparkline: false,
  highlightTopN: DEFAULT_HIGHLIGHT_TOP_N,
  rankColor: "primary",
  badgeColor: "primary",
  sparklineAccent: "auto",
  valueFormat: "number",
  currencyCode: "EUR",
  maxHeight: DEFAULT_MAX_HEIGHT,
});

const { locale, t } = useI18n();
const { processI18n } = useTranslation();
useComponentEvent(props.componentId);
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);
const watchKey = computed(() => JSON.stringify(watchState.value));

const staticData = computed<TopListCardResponse | null>(() =>
  props.staticItems ? { items: props.staticItems } : null,
);

const { data, isLoading } = useChartFetch<TopListCardResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  periodScope: props.periodScope,
  staticData: () => staticData.value,
  watchSource: () => watchKey.value,
});

const items = computed<TopListItem[]>(() => data.value?.items ?? []);
const hasAnyIcon = computed(() =>
  items.value.some((item) => Boolean(item.icon || item.avatar)),
);

const scrollRef = ref<HTMLElement | null>(null);
watch(items, () => {
  if (scrollRef.value) scrollRef.value.scrollTop = 0;
});

function rankLabel(index: number): string {
  return String(index + 1).padStart(RANK_PAD_WIDTH, "0");
}

function rankClass(index: number): string {
  if (index >= props.highlightTopN) return MUTED_RANK_CLASS;
  return (
    RANK_HIGHLIGHT_CLASSES[props.rankColor] ?? RANK_HIGHLIGHT_CLASSES.primary!
  );
}

function formattedValue(item: TopListItem): string {
  return formatValue(
    item.value,
    props.valueFormat,
    locale.value,
    props.currencyCode,
    props.valuePrecision,
  );
}

function sparklineAccentFor(item: TopListItem): string {
  return resolveSparklineAccent(props.sparklineAccent, {
    delta: item.delta ?? null,
    sparkline: item.sparkline ?? [],
    invert: props.invert,
  });
}

const scopeState = usePeriodScope(props.periodScope);
const badgeLabel = computed<string | null>(() => {
  if (!props.periodScope) return null;
  const state = scopeState.value;
  if (!state) return null;
  return t(`${PRESET_LABEL_KEY_PREFIX}.${state.preset}`, state.preset);
});

const emptyLabelDisplay = computed(() =>
  props.emptyLabel
    ? processI18n(props.emptyLabel)
    : t(EMPTY_LABEL_FALLBACK_KEY, EMPTY_LABEL_FALLBACK_TEXT),
);

const maxHeightStyle = computed(() => ({ maxHeight: props.maxHeight }));
const emptyStateStyle = { minHeight: EMPTY_STATE_MIN_HEIGHT };

const RANK_COLUMN_WIDTH = "1.75rem";
const ICON_COLUMN_WIDTH = "1.5rem";
const TITLE_COLUMN_WIDTH = "minmax(0,1fr)";
const VALUE_COLUMN_WIDTH = "auto";
const SPARKLINE_COLUMN_WIDTH = "4rem";
const TREND_COLUMN_WIDTH = "auto";

const gridStyle = computed(() => {
  const columns: string[] = [];
  if (props.showRank) columns.push(RANK_COLUMN_WIDTH);
  if (hasAnyIcon.value) columns.push(ICON_COLUMN_WIDTH);
  columns.push(TITLE_COLUMN_WIDTH);
  columns.push(VALUE_COLUMN_WIDTH);
  if (props.showSparkline) columns.push(SPARKLINE_COLUMN_WIDTH);
  if (props.showDelta) columns.push(TREND_COLUMN_WIDTH);
  return {
    display: "grid",
    gridTemplateColumns: columns.join(" "),
  };
});
</script>

<template>
  <DmsCard :padded="false" class="p-4 sm:p-5">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold sm:text-base">
          {{ processI18n(title) }}
        </p>
        <p v-if="description" class="text-muted mt-0.5 truncate text-xs">
          {{ processI18n(description) }}
        </p>
      </div>
      <UBadge
        v-if="badgeLabel"
        :color="badgeColor"
        variant="soft"
        size="sm"
        class="shrink-0"
      >
        {{ badgeLabel }}
      </UBadge>
    </div>

    <div
      ref="scrollRef"
      class="overflow-y-auto overscroll-contain pr-2"
      :style="maxHeightStyle"
    >
      <ul
        v-if="items.length > 0"
        class="divide-default gap-x-3 divide-y"
        :style="gridStyle"
      >
        <DmsTopListRow
          v-for="(item, index) in items"
          :key="item.id"
          :item="item"
          :show-rank="showRank"
          :rank-label="rankLabel(index)"
          :rank-class="rankClass(index)"
          :has-any-icon="hasAnyIcon"
          :show-sparkline="showSparkline"
          :sparkline-accent="sparklineAccentFor(item)"
          :show-delta="showDelta"
          :invert="invert"
          :formatted-value="formattedValue(item)"
        />
      </ul>

      <div
        v-else-if="!isLoading"
        class="flex items-center justify-center text-center"
        :style="emptyStateStyle"
      >
        <p class="text-muted text-sm">{{ emptyLabelDisplay }}</p>
      </div>

      <div v-else class="space-y-2 py-2">
        <USkeleton
          v-for="i in SKELETON_ROW_COUNT"
          :key="i"
          class="h-10 w-full"
        />
      </div>
    </div>
  </DmsCard>
</template>
