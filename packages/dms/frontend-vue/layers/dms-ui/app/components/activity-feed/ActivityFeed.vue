<script setup lang="ts">
import { computed, resolveComponent } from "vue";
import DmsActivityItem from "../activity/ActivityItem.vue";
import DmsBlockActions, { type BlockAction } from "../blocks/BlockActions.vue";
import DmsEmptyState from "../empty-state/EmptyState.vue";
import DmsEyebrow from "../section-header/Eyebrow.vue";
import { useBlockItems } from "../../composables/blocks/useBlockItems";
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import {
  type ActivityFeedDay,
  type ActivityFeedItem,
  formatActivityTime,
  groupActivityByDay,
} from "./activityFeedDays";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { BlockEmptyText } from "../blocks/BlockStatus.vue";

// The renderer's props are optional: DmsActivityFeed is both the backend
// `ActivityFeed` block (`dms-activity-feed-block`) and a template component.
interface ActivityFeedProps extends Partial<DefaultComponentProps> {
  /** Eyebrow title of the card head ("Activity"). */
  title?: string;
  /** Entries shown when no data source is set. */
  items?: ActivityFeedItem[];
  /** Endpoint answering `{ items }`, newest first. */
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /**
   * Files the entries under day separators ("Today · Sep 29") with their
   * time; off, each entry shows how long ago it happened.
   */
  groupByDay?: boolean;
  /** Shows at most this many entries. */
  maxItems?: number;
  /**
   * Placeholder rows while `fetchUrl` loads: the length the source usually
   * answers, never more than `maxItems`. Optional. Defaults to `maxItems`,
   * or 3.
   */
  skeletonCount?: number;
  /** Link buttons in the card head ("View all"). */
  actions?: BlockAction[];
  /** Empty state text (i18n keys with `$` or literals). */
  empty?: BlockEmptyText;
  /** Mono titles and meta (paths, queries, request logs). */
  mono?: boolean;
  /** Card frame with a head; off, the bare list. */
  card?: boolean;
}

const props = withDefaults(defineProps<ActivityFeedProps>(), {
  title: undefined,
  items: undefined,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  groupByDay: true,
  maxItems: undefined,
  skeletonCount: undefined,
  actions: () => [],
  empty: undefined,
  mono: false,
  card: true,
});

const SKELETON_ROWS = 3;
// A day separator every few placeholder rows, the rhythm of a recent feed.
const SKELETON_ROWS_PER_DAY = 3;
const SKELETON_TITLE_WIDTHS = ["w-3/5", "w-1/2", "w-2/5"];

const { t, locale } = useI18n();
const { processI18n } = useTranslation();

const {
  items: list,
  isPending,
  hasError,
  refresh,
} = useBlockItems<ActivityFeedItem>({
  items: () => props.items,
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  watchActions: props.watchActions,
  componentId: props.componentId,
});

const entries = computed<ActivityFeedItem[]>(() =>
  props.maxItems ? list.value.slice(0, props.maxItems) : list.value,
);

const days = computed<ActivityFeedDay[]>(() =>
  props.groupByDay
    ? groupActivityByDay(entries.value, locale.value, {
        today: t("dms.activity_feed.today"),
        yesterday: t("dms.activity_feed.yesterday"),
      })
    : [{ key: "all", items: entries.value }],
);

const trailingOf = (item: ActivityFeedItem): string | undefined => {
  if (item.time) return processI18n(item.time);
  if (!item.date) return undefined;
  return props.groupByDay
    ? formatActivityTime(item.date, locale.value)
    : formatRelativeTime(item.date, t, locale.value);
};

const metaOf = (item: ActivityFeedItem): string | undefined =>
  item.meta?.length
    ? item.meta.map((entry) => processI18n(entry)).join(" · ")
    : undefined;

const isFirstLoad = isPending;

// The placeholder takes the feed's loaded shape: as many rows as it will show
// (`skeletonCount`, else `maxItems`; never more than `maxItems`), under day
// separators when the entries are grouped by day.
const skeletonDays = computed<number[][]>(() => {
  const wanted = props.skeletonCount ?? props.maxItems ?? SKELETON_ROWS;
  const count = props.maxItems ? Math.min(wanted, props.maxItems) : wanted;
  const perDay = props.groupByDay ? SKELETON_ROWS_PER_DAY : count;
  const days: number[][] = [];
  for (let start = 0; start < count; start += perDay) {
    days.push(
      Array.from(
        { length: Math.min(perDay, count - start) },
        (_, offset) => start + offset,
      ),
    );
  }
  return days;
});
const Wrapper = props.card ? resolveComponent("DmsCard") : "div";
const wrapperProps = computed(() =>
  props.card
    ? {
        padded: false,
        title: props.title ? processI18n(props.title) : undefined,
        class: "min-w-0 overflow-hidden",
      }
    : { class: "min-w-0" },
);
</script>

<template>
  <component :is="Wrapper" v-bind="wrapperProps">
    <template v-if="props.card && props.actions.length" #actions>
      <DmsBlockActions
        :actions="props.actions"
        size="xs"
        lead-variant="ghost"
        lead-color="neutral"
        rest-variant="ghost"
      />
    </template>

    <!-- Rows at the loaded rows' boxes (a 18px title line over a 16px meta
         line beside the 30px well), split by the same hairlines. -->
    <div v-if="isFirstLoad" class="py-1" aria-busy="true">
      <div v-for="(day, dayIndex) in skeletonDays" :key="dayIndex">
        <div
          v-if="props.groupByDay"
          class="flex items-center gap-2.5 px-[18px] pt-3.5 pb-1.5 after:h-px after:flex-1 after:bg-(--ui-border-muted)"
        >
          <USkeleton class="my-[1.5px] h-2.5 w-24 bg-(--dms-skeleton)" />
        </div>
        <div class="divide-y divide-(--ui-border-muted)">
          <div
            v-for="row in day"
            :key="row"
            class="flex items-start gap-3 px-[18px] py-2.5"
          >
            <USkeleton
              class="size-[30px] shrink-0 rounded-lg bg-(--dms-skeleton)"
            />
            <div class="grid flex-1 gap-px">
              <USkeleton
                class="my-[3px] h-3 bg-(--dms-skeleton)"
                :class="
                  SKELETON_TITLE_WIDTHS[row % SKELETON_TITLE_WIDTHS.length]
                "
              />
              <USkeleton class="my-[3px] h-2.5 w-1/3 bg-(--dms-skeleton)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <DmsEmptyState
      v-else-if="hasError"
      variant="error"
      size="sm"
      :title="t('dms.activity_feed.error_title')"
      :description="t('dms.activity_feed.error_description')"
      :actions="[
        {
          label: t('dms.activity_feed.retry'),
          icon: 'i-ph-arrow-clockwise',
          color: 'neutral',
          variant: 'outline',
          onClick: () => refresh(),
        },
      ]"
    />

    <DmsEmptyState
      v-else-if="!entries.length"
      icon="i-ph-tray"
      size="sm"
      :title="
        props.empty
          ? processI18n(props.empty.title)
          : t('dms.activity_feed.empty_title')
      "
      :description="
        props.empty?.description
          ? processI18n(props.empty.description)
          : undefined
      "
    />

    <div v-else class="py-1">
      <section v-for="day in days" :key="day.key">
        <!-- v2 .feed__day: "Today · Sep 29" and a hairline to the edge. -->
        <div
          v-if="props.groupByDay && day.name"
          class="flex items-center gap-2.5 px-[18px] pt-3.5 pb-1.5 after:h-px after:flex-1 after:bg-(--ui-border-muted)"
        >
          <DmsEyebrow as="h3">
            <b class="text-muted font-semibold">{{ day.name }}</b>
            {{ day.date ? ` · ${day.date}` : "" }}
          </DmsEyebrow>
        </div>
        <DmsActivityItem
          v-for="(item, index) in day.items"
          :key="item.id ?? `${day.key}-${index}`"
          :icon="item.icon"
          :icon-color="item.tone ?? 'neutral'"
          :title="processI18n(item.title)"
          :subtitle="metaOf(item)"
          :trailing="trailingOf(item)"
          :unread="item.unread"
          :mono="props.mono"
          :to="item.to"
          :interactive="!!item.to"
        />
      </section>
    </div>
  </component>
</template>
