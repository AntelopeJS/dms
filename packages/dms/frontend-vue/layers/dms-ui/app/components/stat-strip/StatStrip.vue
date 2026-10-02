<script setup lang="ts">
import { computed } from "vue";
import DmsIconWell, { type IconWellTone } from "../icon-well/IconWell.vue";
import DmsEyebrow from "../section-header/Eyebrow.vue";
import DmsAutoLink from "../link/AutoLink.vue";
import { DMS_TONE_TEXT, canonicalTone, type DmsTone } from "../../utils/tone";

export type StatStripLayout = "joined" | "cards";

export interface StatStripItem {
  /** Stable key; the position is used without one. */
  id?: string;
  /** Icon of the well; the cell has no well without one. */
  icon?: string;
  /**
   * Well tone. Defaults to `muted` (quiet row icon) in the joined layout and
   * `accent` in the cards layout.
   */
  tone?: IconWellTone;
  /** Mono label above the value. */
  eyebrow: string;
  /** The figure or the short state ("On", "8 / 10", 12). */
  value: string | number;
  /** One line under the value. */
  detail?: string;
  /** Tone of the detail line (`neutral` = muted text). */
  detailTone?: DmsTone;
  /** Route, `#anchor` or URL the whole cell links to. */
  href?: string;
}

interface StatStripProps {
  items?: StatStripItem[];
  /**
   * `joined`: one card split in cells by hairlines (v2 .cs-status, security
   * status strip). `cards`: one compact stat card per item (v2 .mc-summary,
   * modules summary).
   */
  layout?: StatStripLayout;
  /**
   * Columns on wide screens (1–6); fewer on narrow ones. Defaults to the
   * number of items.
   */
  columns?: number;
  /**
   * Loading: with items, their well and value turn to skeletons (labels stay);
   * without, `skeletonCount` placeholder cells are drawn.
   */
  loading?: boolean;
  /** Placeholder cells drawn while loading without items. */
  skeletonCount?: number;
  /** Accessible name of the strip (announced as a navigation when it links). */
  label?: string;
}

const props = withDefaults(defineProps<StatStripProps>(), {
  items: () => [],
  layout: "joined",
  columns: undefined,
  loading: false,
  skeletonCount: 4,
  label: undefined,
});

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 6;

// Literal class strings (Tailwind extracts them). The columns follow the
// strip's own width (container queries on the root), not the viewport: in a
// narrow settings column at 1024px a four-cell strip keeps two columns
// instead of four cramped ones. The joined strip carries a detail line, so it
// drops to one column when narrow; the compact cards keep two.
const JOINED_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 @sm:grid-cols-2",
  3: "grid-cols-1 @xl:grid-cols-3",
  4: "grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-4",
  5: "grid-cols-1 @sm:grid-cols-2 @4xl:grid-cols-5",
  6: "grid-cols-1 @lg:grid-cols-3 @5xl:grid-cols-6",
};
const CARD_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 @xl:grid-cols-3",
  4: "grid-cols-2 @3xl:grid-cols-4",
  5: "grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5",
  6: "grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-6",
};

// Every joined cell draws its top and start hairlines; the grid is pulled 1px
// up and left under the card's clipping edge, so the first row and the first
// column lose theirs at any column count and on every breakpoint.
const JOINED_CELL =
  "border-muted flex min-w-0 items-start gap-3 border-s border-t px-4 py-3.5";
// Two cards side by side in a strip under 28rem (a phone) are too narrow for
// a well beside the text ("Updates available" lost to an ellipsis at 320px):
// the well goes on top.
const CARD_CELL =
  "dms-card flex items-center gap-3.5 px-4 py-3.5 @max-md:flex-col @max-md:items-start @max-md:gap-2.5";
const CARD_SKELETON = "bg-(--dms-skeleton)";

const isJoined = computed(() => props.layout === "joined");
const columnCount = computed(() => {
  const wanted =
    props.columns ?? (props.items.length || props.skeletonCount || MIN_COLUMNS);
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(wanted)));
});
const columnClass = computed(
  () => (isJoined.value ? JOINED_COLUMNS : CARD_COLUMNS)[columnCount.value],
);
const showPlaceholders = computed(
  () => props.loading && props.items.length === 0,
);
const hasLinks = computed(() => props.items.some((item) => !!item.href));

function keyOf(item: StatStripItem, index: number): string {
  return item.id ?? String(index);
}

function wellTone(item: StatStripItem): IconWellTone {
  return item.tone ?? (isJoined.value ? "muted" : "accent");
}

function detailClass(item: StatStripItem): string {
  return DMS_TONE_TEXT[canonicalTone(item.detailTone ?? "neutral")];
}
// Two layouts: joined (v2 .cs-status, one card with cells split by hairlines)
// and cards (v2 .mc-summary, one compact card per item). The template keeps no
// root-level comment, so a parent's class still falls through in dev builds.
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
        <div
          v-for="index in props.skeletonCount"
          :key="index"
          :class="JOINED_CELL"
        >
          <USkeleton class="size-8 rounded-[9px]" />
          <div class="grid flex-1 gap-1.5">
            <USkeleton class="h-2.5 w-16" />
            <USkeleton class="h-3.5 w-24" />
            <USkeleton class="h-3 w-20" />
          </div>
        </div>
      </template>
      <template v-else>
        <component
          :is="item.href ? DmsAutoLink : 'div'"
          v-for="(item, index) in props.items"
          :key="keyOf(item, index)"
          :to="item.href"
          :class="[
            JOINED_CELL,
            item.href && 'hover:bg-elevated transition-colors',
          ]"
        >
          <USkeleton
            v-if="props.loading && item.icon"
            class="size-8 shrink-0 rounded-[9px]"
          />
          <DmsIconWell
            v-else-if="item.icon"
            :icon="item.icon"
            :tone="wellTone(item)"
            size="sm"
          />
          <span class="grid min-w-0 gap-0.5">
            <DmsEyebrow as="span" size="xs" :label="item.eyebrow" />
            <USkeleton v-if="props.loading" class="my-0.5 h-3.5 w-24" />
            <b
              v-else
              class="text-highlighted text-sm leading-[1.35] font-semibold whitespace-nowrap tabular-nums"
            >
              {{ item.value }}
            </b>
            <template v-if="item.detail">
              <USkeleton v-if="props.loading" class="h-3 w-20" />
              <small v-else class="truncate text-xs" :class="detailClass(item)">
                {{ item.detail }}
              </small>
            </template>
          </span>
        </component>
      </template>
    </div>
  </component>

  <div v-else class="@container" :aria-busy="props.loading || undefined">
    <div class="grid gap-3" :class="columnClass">
      <template v-if="showPlaceholders">
        <div
          v-for="index in props.skeletonCount"
          :key="index"
          :class="CARD_CELL"
        >
          <USkeleton
            class="size-10 shrink-0 rounded-[10px]"
            :class="CARD_SKELETON"
          />
          <div class="grid flex-1 gap-1.5">
            <USkeleton class="h-2.5 w-20" :class="CARD_SKELETON" />
            <USkeleton class="h-[22px] w-10" :class="CARD_SKELETON" />
          </div>
        </div>
      </template>
      <template v-else>
        <component
          :is="item.href ? DmsAutoLink : 'div'"
          v-for="(item, index) in props.items"
          :key="keyOf(item, index)"
          :to="item.href"
          :class="[CARD_CELL, item.href && 'dms-card--interactive']"
        >
          <USkeleton
            v-if="props.loading && item.icon"
            class="size-10 shrink-0 rounded-[10px]"
            :class="CARD_SKELETON"
          />
          <DmsIconWell
            v-else-if="item.icon"
            :icon="item.icon"
            :tone="wellTone(item)"
            size="xl"
          />
          <div class="grid min-w-0 flex-1 gap-[3px]">
            <!-- Truncated on wide screens; on phones the two-column cards are
             too narrow for "Updates available", so the label and the detail
             wrap. -->
            <DmsEyebrow
              tone="muted"
              truncate
              class="@max-md:whitespace-normal"
              :label="item.eyebrow"
            />
            <USkeleton
              v-if="props.loading"
              class="h-[22px] w-10"
              :class="CARD_SKELETON"
            />
            <p
              v-else
              class="text-highlighted text-[22px] leading-[1.1] font-[650] tracking-[-0.035em] tabular-nums"
            >
              {{ item.value }}
            </p>
            <p
              v-if="item.detail && !props.loading"
              class="truncate text-xs @max-md:whitespace-normal"
              :class="detailClass(item)"
            >
              {{ item.detail }}
            </p>
          </div>
        </component>
      </template>
    </div>
  </div>
</template>
