<script setup lang="ts">
import { pageLink } from "../../build/composables/page/pageUrlValues";
import { computed } from "vue";
import type { IconWellTone } from "../icon-well/IconWell.vue";
import DmsStatCell from "../../build/components/stat/StatCell.vue";
import type { Tone } from "../../types/tone";

export type StatGroupLayout = "joined" | "cards";

/** A container size: `sm` 24rem, `md` 28rem, `lg` 32rem, `xl` 36rem. */
export type StatGroupColumnsFrom = "sm" | "md" | "lg" | "xl";

export interface StatGroupItem {
  /** Stable key; the position is used without one. */
  id?: string;
  /** Icon of the well; the cell has no well without one. */
  icon?: string;
  /**
   * Well tone. Defaults to `muted` (quiet row icon) in the joined layout and
   * `primary` in the cards layout.
   */
  tone?: IconWellTone;
  /** Mono label above the value. */
  eyebrow: string;
  /** The figure or the short state ("On", "8 / 10", 12). */
  value: string | number;
  /** One line under the value. */
  detail?: string;
  /** Tone of the detail line (`neutral` = muted text). */
  detailTone?: Tone;
  /** Route, `#anchor` or URL the whole cell links to. */
  to?: string;
}

interface StatGroupProps {
  items?: StatGroupItem[];
  /**
   * `joined`: one card split in cells by hairlines (v2 .cs-status, security
   * status). `cards`: one compact stat card per item (v2 .mc-summary,
   * modules summary).
   */
  layout?: StatGroupLayout;
  /**
   * Columns on wide screens (1–6); fewer on narrow ones. Defaults to the
   * number of items.
   */
  columns?: number;
  /**
   * The group's own width from which all `columns` sit side by side (a
   * container size); below it, one column (`joined`) or the narrow count of
   * `cards`. Defaults to the usual steps for the column count.
   */
  columnsFrom?: StatGroupColumnsFrom;
  /**
   * Loading: with items, their well and value turn to skeletons (labels stay);
   * without, `skeletonCount` placeholder cells are drawn.
   */
  loading?: boolean;
  /** Placeholder cells drawn while loading without items. */
  skeletonCount?: number;
  /** Accessible name of the group (announced as a navigation when it links). */
  label?: string;
}

const props = withDefaults(defineProps<StatGroupProps>(), {
  items: () => [],
  layout: "joined",
  columns: undefined,
  columnsFrom: undefined,
  loading: false,
  skeletonCount: 4,
  label: undefined,
});

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 6;

const JOINED_COLUMNS: Record<NonNullable<StatGroupProps["columns"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 @sm:grid-cols-2",
  3: "grid-cols-1 @xl:grid-cols-3",
  4: "grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-4",
  5: "grid-cols-1 @sm:grid-cols-2 @4xl:grid-cols-5",
  6: "grid-cols-1 @lg:grid-cols-3 @5xl:grid-cols-6",
};
const CARD_COLUMNS: Record<NonNullable<StatGroupProps["columns"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 @xl:grid-cols-3",
  4: "grid-cols-2 @3xl:grid-cols-4",
  5: "grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5",
  6: "grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-6",
};

const COLUMNS_FROM: Record<StatGroupColumnsFrom, Record<number, string>> = {
  sm: {
    2: "@sm:grid-cols-2",
    3: "@sm:grid-cols-3",
    4: "@sm:grid-cols-4",
    5: "@sm:grid-cols-5",
    6: "@sm:grid-cols-6",
  },
  md: {
    2: "@md:grid-cols-2",
    3: "@md:grid-cols-3",
    4: "@md:grid-cols-4",
    5: "@md:grid-cols-5",
    6: "@md:grid-cols-6",
  },
  lg: {
    2: "@lg:grid-cols-2",
    3: "@lg:grid-cols-3",
    4: "@lg:grid-cols-4",
    5: "@lg:grid-cols-5",
    6: "@lg:grid-cols-6",
  },
  xl: {
    2: "@xl:grid-cols-2",
    3: "@xl:grid-cols-3",
    4: "@xl:grid-cols-4",
    5: "@xl:grid-cols-5",
    6: "@xl:grid-cols-6",
  },
};

const JOINED_HAIRLINES = "border-muted border-s border-t";

const isJoined = computed(() => props.layout === "joined");
const columnCount = computed(() => {
  const wanted =
    props.columns ?? (props.items.length || props.skeletonCount || MIN_COLUMNS);
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(wanted)));
});
const columnClass = computed(() => {
  const steps = (isJoined.value ? JOINED_COLUMNS : CARD_COLUMNS)[
    columnCount.value
  ]!;
  const from =
    props.columnsFrom && COLUMNS_FROM[props.columnsFrom][columnCount.value];
  if (!from) return steps;

  return `${steps.split(" ")[0]} ${from}`;
});
const showPlaceholders = computed(
  () => props.loading && props.items.length === 0,
);
const hasLinks = computed(() => props.items.some((item) => !!item.to));

function keyOf(item: StatGroupItem, index: number): string {
  return item.id ?? String(index);
}

function wellTone(item: StatGroupItem): IconWellTone {
  return item.tone ?? (isJoined.value ? "muted" : "primary");
}
</script>

<template>
  <component
    :is="hasLinks ? 'nav' : 'div'"
    v-if="isJoined"
    class="dms-card @container overflow-hidden"
    :aria-label="props.label"
    :aria-busy="props.loading || undefined"
  >
    <div class="-ms-px -mt-px grid" :class="columnClass">
      <template v-if="showPlaceholders">
        <DmsStatCell
          v-for="index in props.skeletonCount"
          :key="index"
          size="sm"
          placeholder
          :class="JOINED_HAIRLINES"
        />
      </template>
      <template v-else>
        <DmsStatCell
          v-for="(item, index) in props.items"
          :key="keyOf(item, index)"
          :eyebrow="item.eyebrow"
          :value="item.value"
          :icon="item.icon"
          :detail="item.detail"
          :detail-tone="item.detailTone"
          :to="pageLink(item.to)"
          size="sm"
          :tone="wellTone(item)"
          :loading="props.loading"
          :class="JOINED_HAIRLINES"
        />
      </template>
    </div>
  </component>

  <div v-else class="@container" :aria-busy="props.loading || undefined">
    <div class="grid gap-3" :class="columnClass">
      <template v-if="showPlaceholders">
        <DmsStatCell
          v-for="index in props.skeletonCount"
          :key="index"
          placeholder
          stack
        />
      </template>
      <template v-else>
        <DmsStatCell
          v-for="(item, index) in props.items"
          :key="keyOf(item, index)"
          :eyebrow="item.eyebrow"
          :value="item.value"
          :icon="item.icon"
          :detail="item.detail"
          :detail-tone="item.detailTone"
          :to="pageLink(item.to)"
          :tone="wellTone(item)"
          :loading="props.loading"
          stack
        />
      </template>
    </div>
  </div>
</template>
