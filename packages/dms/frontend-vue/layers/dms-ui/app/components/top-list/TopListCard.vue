<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import DmsEmptyState from "../empty-state/EmptyState.vue";
import DmsSectionHeader from "../section-header/SectionHeader.vue";
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
  /** 3px proportion bar under each title, width = value / largest value. */
  showBar?: boolean;
  sparklineAccent?: string;
  invert?: boolean;
  badgeColor?: UiColor;
  maxHeight?: string;
  staticItems?: TopListItem[];
  emptyLabel?: string;
}

const DEFAULT_MAX_HEIGHT = "24rem";
const DEFAULT_HIGHLIGHT_TOP_N = 3;
const SKELETON_ROW_COUNT = 5;
const PERCENT = 100;
const PRESET_LABEL_KEY_PREFIX = "dms.period.presets";
const EMPTY_LABEL_FALLBACK_KEY = "dms.top_list.empty";
const EMPTY_LABEL_FALLBACK_TEXT = "No data";
const EMPTY_ICON = "i-ph-rows";
const PLAIN_RANK_CLASS =
  "text-dimmed font-semibold ring-1 ring-default ring-inset";
const QUIET_BAR_OPACITY_CLASS = "opacity-45";

// Solid rank fills keep dark ink in both themes (v2 top list).
const RANK_FILL_CLASSES: Record<string, string> = {
  primary: "bg-(--dms-accent-fill)",
  secondary: "bg-(--ui-color-secondary-400)",
  info: "bg-(--ui-color-info-400)",
  success: "bg-(--ui-color-success-400)",
  warning: "bg-(--ui-color-warning-400)",
  error: "bg-(--ui-color-error-400)",
  neutral: "bg-(--ui-border-accented)",
};
const RANK_TILE_CLASS =
  "text-(--dms-accent-on-fill) shadow-(--dms-fill-highlight)";

const props = withDefaults(defineProps<Props>(), {
  showRank: true,
  showDelta: true,
  showSparkline: false,
  showBar: false,
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
const largestValue = computed(() =>
  Math.max(0, ...items.value.map((item) => item.value)),
);

// The fade mask only applies when the list actually scrolls, so a short list
// keeps its last row fully visible.
const scrollRef = ref<HTMLElement | null>(null);
const isOverflowing = ref(false);
function measureOverflow() {
  const element = scrollRef.value;
  isOverflowing.value =
    !!element && element.scrollHeight > element.clientHeight;
}
watch(items, async () => {
  if (scrollRef.value) scrollRef.value.scrollTop = 0;
  await nextTick();
  measureOverflow();
});
onMounted(measureOverflow);

const rankFillClass = computed(
  () => RANK_FILL_CLASSES[props.rankColor] ?? RANK_FILL_CLASSES.primary!,
);

function isHighlighted(index: number): boolean {
  return index < props.highlightTopN;
}

function rankClass(index: number): string {
  if (!isHighlighted(index)) return PLAIN_RANK_CLASS;
  return `${rankFillClass.value} ${RANK_TILE_CLASS}`;
}

function barPercent(item: TopListItem): number | null {
  if (!props.showBar || largestValue.value <= 0) return null;
  return (Math.max(item.value, 0) / largestValue.value) * PERCENT;
}

function barClass(index: number): string {
  if (isHighlighted(index)) return rankFillClass.value;
  return `${rankFillClass.value} ${QUIET_BAR_OPACITY_CLASS}`;
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

// Edge tracks inset the rows by 18px (6px + the 12px column gap) while the
// hover band still runs edge to edge; padding on a subgrid row would spill
// out of the fixed-width tracks instead.
const EDGE_COLUMN_WIDTH = "6px";
const RANK_COLUMN_WIDTH = "26px";
const ICON_COLUMN_WIDTH = "26px";
const TITLE_COLUMN_WIDTH = "minmax(0,1fr)";
const VALUE_COLUMN_WIDTH = "auto";
const SPARKLINE_COLUMN_WIDTH = "4rem";
// Fixed so the deltas line up down the list whatever their length.
const TREND_COLUMN_WIDTH = "62px";

// The columns follow the card's own width (a container query), not the
// viewport: a narrow card (a phone, a third of a dashboard row) drops the
// sparkline column under 28rem, then the icon column under 22rem, so the
// title keeps room instead of being squeezed to nothing.
function columnsTemplate(sparkline: boolean, icon: boolean): string {
  const columns: string[] = [EDGE_COLUMN_WIDTH];
  if (props.showRank) columns.push(RANK_COLUMN_WIDTH);
  if (icon && hasAnyIcon.value) columns.push(ICON_COLUMN_WIDTH);
  columns.push(TITLE_COLUMN_WIDTH);
  columns.push(VALUE_COLUMN_WIDTH);
  if (sparkline && props.showSparkline) columns.push(SPARKLINE_COLUMN_WIDTH);
  if (props.showDelta) columns.push(TREND_COLUMN_WIDTH);
  columns.push(EDGE_COLUMN_WIDTH);
  return columns.join(" ");
}

const gridStyle = computed(() => ({
  "--dms-top-list-cols": columnsTemplate(true, true),
  "--dms-top-list-cols-mid": columnsTemplate(false, true),
  "--dms-top-list-cols-narrow": columnsTemplate(false, false),
}));
</script>

<template>
  <DmsCard :padded="false" class="flex min-w-0 flex-col overflow-hidden">
    <DmsSectionHeader
      size="card"
      class="border-default border-b py-3.5 pr-4 pl-[18px]"
      :title="processI18n(title)"
      :description="description ? processI18n(description) : undefined"
    >
      <template v-if="badgeLabel" #trailing>
        <UBadge :color="badgeColor" variant="soft" size="sm">
          {{ badgeLabel }}
        </UBadge>
      </template>
    </DmsSectionHeader>

    <div
      ref="scrollRef"
      class="@container [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      :class="
        isOverflowing &&
        '[mask-image:linear-gradient(to_bottom,black_calc(100%-36px),transparent)]'
      "
      :style="maxHeightStyle"
    >
      <ul
        v-if="items.length > 0"
        class="grid [grid-template-columns:var(--dms-top-list-cols-narrow)] gap-x-2 divide-y divide-(--ui-border-muted) py-1 @[22rem]:[grid-template-columns:var(--dms-top-list-cols-mid)] @[22rem]:gap-x-3 @[28rem]:[grid-template-columns:var(--dms-top-list-cols)]"
        :style="gridStyle"
      >
        <DmsTopListRow
          v-for="(item, index) in items"
          :key="item.id"
          :item="item"
          :show-rank="showRank"
          :rank-label="String(index + 1)"
          :rank-class="rankClass(index)"
          :has-any-icon="hasAnyIcon"
          :show-sparkline="showSparkline"
          :sparkline-accent="sparklineAccentFor(item)"
          :show-delta="showDelta"
          :invert="invert"
          :formatted-value="formattedValue(item)"
          :bar-percent="barPercent(item)"
          :bar-class="barClass(index)"
        />
      </ul>

      <DmsEmptyState
        v-else-if="!isLoading"
        :icon="EMPTY_ICON"
        :title="emptyLabelDisplay"
        size="sm"
        class="min-h-48 place-content-center"
      />

      <div v-else class="divide-y divide-(--ui-border-muted)" aria-busy="true">
        <div
          v-for="row in SKELETON_ROW_COUNT"
          :key="row"
          class="flex h-14 items-center gap-3 px-[18px]"
        >
          <USkeleton
            v-if="showRank"
            class="size-[26px] shrink-0 rounded-[7px] bg-(--dms-skeleton)"
          />
          <div class="grid flex-1 gap-1.5">
            <USkeleton class="h-3 w-2/5 bg-(--dms-skeleton)" />
            <USkeleton class="h-2.5 w-1/4 bg-(--dms-skeleton)" />
          </div>
          <USkeleton class="h-3 w-14 bg-(--dms-skeleton)" />
        </div>
      </div>
    </div>
  </DmsCard>
</template>
