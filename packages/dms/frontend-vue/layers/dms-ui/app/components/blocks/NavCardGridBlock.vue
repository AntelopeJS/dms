<script setup lang="ts">
import { computed } from "vue";
import DmsNavCard from "../card/NavCard.vue";
import DmsSectionHeader from "../section-header/SectionHeader.vue";
import DmsBlockStatus from "./BlockStatus.vue";
import { useBlockItems } from "../../composables/blocks/useBlockItems";
import type { IconWellTone } from "../icon-well/IconWell.vue";
import type { DmsTone } from "../../utils/tone";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// `NavCardGrid` block (interface-dms `base/nav-card-grid`): a responsive grid
// of navigation cards (v2 settings overview, a module's home), static or from
// `fetchUrl` (`{ items }`) so each card can carry its target's live state.
interface NavCardGridItem {
  id?: string;
  title: string;
  description?: string;
  icon: string;
  iconTone?: IconWellTone;
  to: string;
  state?: string;
  stateTone?: DmsTone;
  badge?: string;
  readout?: string[];
}

interface NavCardGridBlockProps extends DefaultComponentProps {
  items?: NavCardGridItem[];
  /** Columns on wide screens (1–4); fewer on narrow ones. */
  columns?: number;
  /** Section title above the grid. */
  title?: string;
  description?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  emptyLabel?: string;
  /**
   * Placeholder cards while `fetchUrl` loads: the length it usually answers.
   * Optional. Defaults to `columns` (one row), or 3.
   */
  skeletonCount?: number;
}

const props = withDefaults(defineProps<NavCardGridBlockProps>(), {
  items: () => [],
  columns: 3,
  title: undefined,
  description: undefined,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  emptyLabel: undefined,
  skeletonCount: undefined,
});

const MAX_COLUMNS = 4;
const COLUMN_CLASSES: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
};

const { processI18n } = useTranslation();

const { items, isPending, hasError, refresh } = useBlockItems<NavCardGridItem>({
  items: () => props.items,
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  watchActions: props.watchActions,
  componentId: props.componentId,
});

const columnCount = computed(() =>
  Math.min(MAX_COLUMNS, Math.max(1, Math.round(props.columns))),
);
const placeholders = computed(() => props.skeletonCount ?? columnCount.value);

const cards = computed(() =>
  items.value.map((item, index) => ({
    ...item,
    key: item.id ?? `${index}-${item.to}`,
    title: processI18n(item.title ?? ""),
    description: item.description ? processI18n(item.description) : undefined,
    state: item.state ? processI18n(item.state) : undefined,
    readout: item.readout?.map((line) => processI18n(line)),
  })),
);
// v2 .sx-grid: cards closing on a state line run a tighter rhythm, the whole
// grid at once so the rows stay aligned.
const hasStates = computed(() => cards.value.some((card) => !!card.state));
</script>

<template>
  <section>
    <DmsSectionHeader
      v-if="props.title || props.description"
      class="mb-3"
      :title="props.title ? processI18n(props.title) : undefined"
      :description="
        props.description ? processI18n(props.description) : undefined
      "
    />
    <DmsBlockStatus v-if="hasError" state="error" @retry="refresh()" />
    <DmsBlockStatus
      v-else-if="!isPending && cards.length === 0"
      state="empty"
      :label="props.emptyLabel ? processI18n(props.emptyLabel) : undefined"
    />
    <div
      v-else
      class="grid gap-3"
      :class="COLUMN_CLASSES[columnCount]"
      :aria-busy="isPending || undefined"
    >
      <template v-if="isPending">
        <!-- The loaded card's shape at its boxes: the head (36px), a two-line
             description (39px) and the live state line (17px) a fetched card
             closes on, in the tighter rhythm such cards run. -->
        <div
          v-for="index in placeholders"
          :key="index"
          class="dms-card flex flex-col gap-2.5 p-[18px]"
        >
          <div class="flex items-center gap-3">
            <USkeleton class="size-9 rounded-[10px] bg-(--dms-skeleton)" />
            <USkeleton class="h-3.5 w-28 bg-(--dms-skeleton)" />
          </div>
          <div class="grid h-[39px] content-center gap-[7.5px]">
            <USkeleton class="h-3 w-4/5 bg-(--dms-skeleton)" />
            <USkeleton class="h-3 w-3/5 bg-(--dms-skeleton)" />
          </div>
          <USkeleton class="my-[2.5px] h-3 w-28 bg-(--dms-skeleton)" />
        </div>
      </template>
      <template v-else>
        <DmsNavCard
          v-for="card in cards"
          :key="card.key"
          :to="card.to"
          :icon="card.icon"
          :icon-tone="card.iconTone"
          :title="card.title"
          :description="card.description"
          :state="card.state"
          :state-tone="card.stateTone"
          :badge="card.badge"
          :readout="card.readout"
          :class="hasStates && 'gap-2.5'"
        />
      </template>
    </div>
  </section>
</template>
