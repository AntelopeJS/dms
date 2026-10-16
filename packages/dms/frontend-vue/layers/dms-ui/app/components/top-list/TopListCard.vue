<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import DmsEmptyState from "../empty-state/EmptyState.vue";
import DmsSectionHeader from "../section-header/SectionHeader.vue";
import DmsBlockActions, {
  type BlockAction,
} from "../../build/components/blocks/BlockActions.vue";
// Imported rather than resolved from the registry: a registered component is
// a lazy chunk of its own, and a list whose rows only arrive with its data
// would draw an empty card for the moment that chunk takes.
import DmsTopListRow from "./internal/TopListRow.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { formatValue } from "../../composables/chart/formatValue";
import { resolveSparklineAccent } from "../../composables/chart/resolveSparklineAccent";
import { usePeriodScopePreset } from "#dms-core/app/composables/period/usePeriodScope";
import {
  hasUrlVariables,
  resolveLinkVariables,
} from "../../build/utils/urlVariables";
import type {
  TopListCardResponse,
  TopListItem,
  UiColor,
  ValueFormat,
  ValuePrecision,
} from "../../composables/chart/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { useComposedText } from "../../../../dms-core/app/composables/translation/useComposedText";

interface Props extends DefaultComponentProps {
  title: string;
  description?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  /** Unit after each formatted value, space included (" ms"); `$` key or literal. */
  valueSuffix?: string;
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
  /** Link buttons in the card head, after the period badge. */
  actions?: BlockAction[];
  /**
   * Placeholder rows while `fetchUrl` loads: the "top N" it answers.
   * Optional. Defaults to 10, enough to fill the default `maxHeight`.
   */
  skeletonCount?: number;
}

const DEFAULT_MAX_HEIGHT = "24rem";
const DEFAULT_HIGHLIGHT_TOP_N = 3;
// A top list is a "top N" (10 most of the time): enough placeholder rows to
// fill the card to its max height, which clips them exactly where it clips
// the loaded list, so the card does not grow when the rows land.
const SKELETON_ROW_COUNT = 10;
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
  skeletonCount: SKELETON_ROW_COUNT,
  actions: () => [],
});

const { locale, t } = useI18n();
const { processI18n } = useTranslation();
const { processText } = useComposedText();
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
  routeParams: () => props.routeParams,
  periodScope: props.periodScope,
  realtimeTopic: props.realtimeTopic,
  staticData: () => staticData.value,
  watchSource: () => watchKey.value,
});

// A row's link may name the page it is shown on (`{{query.website}}`), so a
// list served once leads on with the page's own context, as the URL changes.
// The route is only read for a list holding such a link.
function withPageValues(item: TopListItem): TopListItem {
  if (!item.to || !hasUrlVariables(item.to)) return item;
  return {
    ...item,
    to: resolveLinkVariables(item.to, {
      routeParams: props.routeParams,
      routeQuery: useDmsRoute().query as Record<string, unknown>,
    }),
  };
}

const items = computed<TopListItem[]>(() =>
  (data.value?.items ?? []).map(withPageValues),
);
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

const valueSuffixText = computed(() =>
  props.valueSuffix ? processI18n(props.valueSuffix) : "",
);

function formattedValue(item: TopListItem): string {
  if (item.valueLabel) return processText(item.valueLabel);
  const formatted = formatValue(
    item.value,
    props.valueFormat,
    locale.value,
    props.currencyCode,
    props.valuePrecision,
  );
  return `${formatted}${valueSuffixText.value}`;
}

function sparklineAccentFor(item: TopListItem): string {
  return resolveSparklineAccent(props.sparklineAccent, {
    delta: item.delta ?? null,
    sparkline: item.sparkline ?? [],
    invert: props.invert,
  });
}

// The preset is a name, the same on both sides: the server prints the badge
// of a selector set up before the card, and the browser hydrates it. A
// selector set up after it draws a skeleton in its place until it registers.
const scopePreset = usePeriodScopePreset(props.periodScope);
const badgeLabel = computed<string | null>(() => {
  const preset = scopePreset.value;
  if (!props.periodScope || !preset) return null;
  return t(`${PRESET_LABEL_KEY_PREFIX}.${preset}`, preset);
});

const isFirstLoad = computed(() => isLoading.value && data.value === null);
// New inputs (a period applied) are on their way: the rows on screen still
// belong to the previous ones, so they dim like the KPI values do.
const isRefreshing = computed(() => isLoading.value && data.value !== null);

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
      <template v-if="periodScope || props.actions.length" #trailing>
        <template v-if="periodScope">
          <UBadge
            v-if="badgeLabel"
            :color="badgeColor"
            variant="soft"
            size="sm"
          >
            {{ badgeLabel }}
          </UBadge>
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            v-else
            class="h-5 w-16 rounded-[5px]"
            aria-hidden="true"
          />
        </template>
        <!-- Quiet links, as in an ActivityFeed head: the rows stay the
          card's content. -->
        <DmsBlockActions
          v-if="props.actions.length"
          :actions="props.actions"
          size="xs"
          lead-variant="ghost"
          lead-color="neutral"
          rest-variant="ghost"
        />
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
        :aria-busy="isRefreshing || undefined"
        :class="isRefreshing && 'opacity-55'"
        class="grid [grid-template-columns:var(--dms-top-list-cols-narrow)] gap-x-2 divide-y divide-(--ui-border-muted) py-1 transition-opacity @[22rem]:[grid-template-columns:var(--dms-top-list-cols-mid)] @[22rem]:gap-x-3 @[28rem]:[grid-template-columns:var(--dms-top-list-cols)]"
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
        v-else-if="!isFirstLoad"
        :icon="EMPTY_ICON"
        :title="emptyLabelDisplay"
        size="sm"
        class="min-h-48 place-content-center"
      />

      <div
        v-else
        class="divide-y divide-(--ui-border-muted) py-1"
        aria-busy="true"
      >
        <div
          v-for="row in props.skeletonCount"
          :key="row"
          class="flex h-14 items-center gap-3 px-[18px]"
        >
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            v-if="showRank"
            class="size-[26px] shrink-0 rounded-[7px]"
          />
          <div class="grid flex-1 gap-1.5">
            <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-2/5" />
            <USkeleton
              :aria-label="t('dms.a11y.loading')"
              class="h-2.5 w-1/4"
            />
          </div>
          <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-14" />
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            v-if="showDelta"
            class="h-3 w-[46px]"
          />
        </div>
      </div>
    </div>
  </DmsCard>
</template>
